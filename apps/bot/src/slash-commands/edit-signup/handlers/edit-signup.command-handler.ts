import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import {
  EncounterFriendlyDescription,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import {
  ActionRowBuilder,
  type ButtonBuilder,
  type ChatInputCommandInteraction,
  Colors,
  type ComponentType,
  DiscordjsErrorCodes,
  EmbedBuilder,
  type Message,
  MessageFlags,
  type StringSelectMenuBuilder,
} from 'discord.js';
import type { ZodError } from 'zod';
import { isSameUserFilter } from '../../../common/collection-filters.js';
import {
  CancelButton,
  ConfirmButton,
} from '../../../common/components/buttons.js';
import {
  characterField,
  worldField,
} from '../../../common/components/fields.js';
import { createFields } from '../../../common/embed-helpers.js';
import { appConfig } from '../../../config/app.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { EncountersService } from '../../../encounters/encounters.service.js';
import { EncountersComponentsService } from '../../../encounters/encounters-components.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import { DeclineReasonRequestService } from '../../signup/decline-reason-request.service.js';
import {
  SignupApprovedEvent,
  SignupDeclinedEvent,
} from '../../signup/events/signup.events.js';
import { SignupMutationService } from '../../signup/signup-mutation.service.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import {
  EDIT_APPROVE_BUTTON_ID,
  EditApproveButton,
  EditDeclineButton,
} from '../edit-signup.components.js';
import { EDIT_SIGNUP_MESSAGES } from '../edit-signup.consts.js';
import {
  type EditSignupSchema,
  editSignupSchema,
} from '../edit-signup.schema.js';
import { createEditSignupSlashCommand } from '../edit-signup.slash-command.js';

type EditDecision = 'approve' | 'decline';

interface EditSelection {
  decision: EditDecision;
  selectedProgPoint: string | undefined;
}

interface EditContext {
  signup: SignupDocument;
  settings: SettingsDocument;
  reviewMessage: Message<true>;
}

interface EditDiff {
  oldProgPointLabel: string;
  newProgPointLabel: string;
  oldStatus: SignupStatus;
  newStatus: SignupStatus;
}

@Injectable()
@SlashCommand({
  builder: createEditSignupSlashCommand(appConfig.APPLICATION_MODE),
})
class EditSignupCommandHandler implements ISlashCommand {
  private static readonly COLLECT_TIMEOUT = 120_000;
  private static readonly CONFIRM_TIMEOUT = 60_000;
  private readonly logger = new Logger(EditSignupCommandHandler.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
    private readonly signupCollection: SignupCollection,
    private readonly encountersService: EncountersService,
    private readonly encountersComponentsService: EncountersComponentsService,
    private readonly mutationService: SignupMutationService,
    private readonly declineReasonRequestService: DeclineReasonRequestService,
    private readonly eventBus: EventBus,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await this.run(interaction);
    } catch (error) {
      const embed = this.errorService.handleCommandError(error, interaction);
      await interaction.editReply({ embeds: [embed], components: [] });
    }
  }

  private async run(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const parsed = this.parseOptions(interaction);

    if (!parsed.success) {
      await interaction.editReply({
        embeds: [this.createValidationErrorEmbed(parsed.error)],
      });
      return;
    }

    const options = parsed.data;
    Sentry.getCurrentScope().setExtra('options', options);

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    if (!settings?.reviewerRole || !settings.reviewChannel) {
      await this.replyError(interaction, EDIT_SIGNUP_MESSAGES.MISSING_SETTINGS);
      return;
    }

    const isReviewer = await this.discordService.userHasRole({
      userId: interaction.user.id,
      roleId: settings.reviewerRole,
      guildId: interaction.guildId,
    });

    if (!isReviewer) {
      await this.replyError(
        interaction,
        EDIT_SIGNUP_MESSAGES.MISSING_PERMISSIONS,
      );
      return;
    }

    const signup = await this.findSignup(interaction, options);
    if (!signup) return;

    if (!signup.reviewMessageId) {
      await this.replyError(interaction, EDIT_SIGNUP_MESSAGES.NOT_FOUND);
      return;
    }

    const reviewMessage = await this.discordService.fetchMessage(
      interaction.guildId,
      settings.reviewChannel,
      signup.reviewMessageId,
    );

    if (!reviewMessage?.inGuild()) {
      await this.replyError(
        interaction,
        EDIT_SIGNUP_MESSAGES.REVIEW_MESSAGE_MISSING,
      );
      return;
    }

    await this.collectConfirmApply(interaction, {
      signup,
      settings,
      reviewMessage,
    });
  }

  private parseOptions(interaction: ChatInputCommandInteraction<'cached'>) {
    const { options } = interaction;

    return editSignupSchema.safeParse({
      user: options.getUser('user')?.id,
      character: options.getString('character') ?? undefined,
      encounter: options.getString('encounter') ?? undefined,
    });
  }

  private createValidationErrorEmbed(
    error: ZodError<EditSignupSchema>,
  ): EmbedBuilder {
    const description =
      error.issues.map((issue) => issue.message).join('\n') ||
      'Validation failed';

    return new EmbedBuilder()
      .setTitle('Edit Signup - Validation Error')
      .setDescription(description)
      .setColor(Colors.Red);
  }

  /** Resolve the single reviewed signup the reviewer is targeting. */
  private async findSignup(
    interaction: ChatInputCommandInteraction<'cached'>,
    options: EditSignupSchema,
  ): Promise<SignupDocument | undefined> {
    const candidates = await this.lookupCandidates(options);

    const reviewed = candidates.filter(
      (signup) =>
        (signup.status === SignupStatus.APPROVED ||
          signup.status === SignupStatus.DECLINED) &&
        !!signup.reviewMessageId,
    );

    const matching = options.encounter
      ? reviewed.filter((signup) => signup.encounter === options.encounter)
      : reviewed;

    if (matching.length === 0) {
      await this.replyError(interaction, EDIT_SIGNUP_MESSAGES.NOT_FOUND);
      return undefined;
    }

    if (matching.length > 1) {
      await this.replyError(interaction, EDIT_SIGNUP_MESSAGES.AMBIGUOUS);
      return undefined;
    }

    return matching[0];
  }

  private async lookupCandidates(
    options: EditSignupSchema,
  ): Promise<SignupDocument[]> {
    if (options.user !== undefined) {
      return this.signupCollection.findAll({ discordId: options.user });
    }

    const byStatus = await this.signupCollection.findByStatusIn([
      SignupStatus.APPROVED,
      SignupStatus.DECLINED,
    ]);

    return byStatus.filter(
      (signup) => signup.character.toLowerCase() === options.character,
    );
  }

  private async collectConfirmApply(
    interaction: ChatInputCommandInteraction<'cached'>,
    context: EditContext,
  ): Promise<void> {
    const { signup } = context;

    const progPoints = await this.encountersService.getProgPoints(
      signup.encounter,
    );

    const labelFor = (progPointId: string | undefined): string => {
      if (!progPointId) return 'None';
      if (progPointId === PartyStatus.Cleared) return 'Cleared';
      return (
        progPoints.find((point) => point.id === progPointId)?.label ??
        progPointId
      );
    };

    const formMessage = await interaction.editReply({
      embeds: [this.buildFormEmbed(signup, labelFor(signup.progPoint))],
      components: await this.buildFormRows(signup),
    });

    const selection = await this.collectEdit(interaction, formMessage);

    if (!selection) {
      await interaction.editReply({
        content: EDIT_SIGNUP_MESSAGES.TIMEOUT,
        embeds: [],
        components: [],
      });
      return;
    }

    // A decline never persists a prog point (`applyDecline` writes status only),
    // so ignore any menu pick on that path — the diff must not promise a change
    // that won't happen.
    const newProgPoint =
      selection.decision === 'decline'
        ? signup.progPoint
        : (selection.selectedProgPoint ?? signup.progPoint);
    const newStatus =
      selection.decision === 'approve'
        ? SignupStatus.APPROVED
        : SignupStatus.DECLINED;

    if (newProgPoint === signup.progPoint && newStatus === signup.status) {
      await interaction.editReply({
        content: EDIT_SIGNUP_MESSAGES.NO_CHANGES,
        embeds: [],
        components: [],
      });
      return;
    }

    const diff: EditDiff = {
      oldProgPointLabel: labelFor(signup.progPoint),
      newProgPointLabel: labelFor(newProgPoint),
      oldStatus: signup.status,
      newStatus,
    };

    const confirmed = await this.confirmEdit(interaction, diff);
    if (!confirmed) return;

    await this.applyEdit(
      interaction,
      context,
      selection.decision,
      newProgPoint,
    );

    await interaction.editReply({
      content: '',
      embeds: [this.buildSuccessEmbed(interaction, diff)],
      components: [],
    });
  }

  private async buildFormRows(signup: SignupDocument) {
    const menu =
      await this.encountersComponentsService.createProgPointSelectMenu(
        signup.encounter,
        {
          includeCleared: true,
          defaultValue: signup.progPoint ?? undefined,
        },
      );

    const selectRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      EditApproveButton,
      EditDeclineButton,
    );

    return [selectRow, buttonRow];
  }

  private buildFormEmbed(
    signup: SignupDocument,
    currentProgPointLabel: string,
  ): EmbedBuilder {
    const fields = createFields([
      characterField(signup.character),
      worldField(signup.world, 'Home World'),
      { name: 'Job', value: signup.role, inline: true },
      {
        name: 'Current Prog Point',
        value: currentProgPointLabel,
        inline: true,
      },
      { name: 'Current Decision', value: signup.status, inline: true },
    ]);

    return new EmbedBuilder()
      .setTitle(
        `Edit Signup — ${EncounterFriendlyDescription[signup.encounter]}`,
      )
      .setDescription(
        'Pick a new prog point and/or an approval decision below.',
      )
      .setColor(Colors.Blue)
      .addFields(fields);
  }

  /**
   * Drive the two-row form (prog-point select + approve/decline buttons) with a
   * component collector. Resolves with the reviewer's selection, or `undefined`
   * when the collector ends without a decision (timeout).
   */
  private collectEdit(
    interaction: ChatInputCommandInteraction<'cached'>,
    message: Message<true>,
  ): Promise<EditSelection | undefined> {
    return new Promise((resolve) => {
      const collector = message.createMessageComponentCollector({
        filter: isSameUserFilter(interaction.user),
        time: EditSignupCommandHandler.COLLECT_TIMEOUT,
      });

      let selectedProgPoint: string | undefined;
      let decision: EditDecision | undefined;

      collector.on('collect', async (componentInteraction) => {
        if (componentInteraction.isStringSelectMenu()) {
          await componentInteraction.deferUpdate();
          selectedProgPoint = componentInteraction.values.at(0);
          return;
        }

        if (componentInteraction.isButton()) {
          await componentInteraction.deferUpdate();
          decision =
            componentInteraction.customId === EDIT_APPROVE_BUTTON_ID
              ? 'approve'
              : 'decline';
          collector.stop('submitted');
        }
      });

      collector.on('end', (_collected, reason) => {
        if (reason === 'submitted' && decision) {
          resolve({ decision, selectedProgPoint });
          return;
        }
        resolve(undefined);
      });
    });
  }

  private async confirmEdit(
    interaction: ChatInputCommandInteraction<'cached'>,
    diff: EditDiff,
  ): Promise<boolean> {
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ConfirmButton,
      CancelButton,
    );

    const confirmationMessage = await interaction.editReply({
      embeds: [this.buildDiffEmbed(diff)],
      components: [buttonRow],
    });

    try {
      const response =
        await confirmationMessage.awaitMessageComponent<ComponentType.Button>({
          filter: isSameUserFilter(interaction.user),
          time: EditSignupCommandHandler.CONFIRM_TIMEOUT,
        });

      if (response.customId === 'confirm') {
        return true;
      }

      await interaction.editReply({
        content: EDIT_SIGNUP_MESSAGES.CANCELLED,
        embeds: [],
        components: [],
      });
      return false;
    } catch (error) {
      if (this.isCollectorTimeoutError(error)) {
        await interaction.editReply({
          content: EDIT_SIGNUP_MESSAGES.TIMEOUT,
          embeds: [],
          components: [],
        });
        return false;
      }
      throw error;
    }
  }

  private isCollectorTimeoutError(error: unknown): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === DiscordjsErrorCodes.InteractionCollectorError
    );
  }

  private async applyEdit(
    interaction: ChatInputCommandInteraction<'cached'>,
    { signup, settings, reviewMessage }: EditContext,
    decision: EditDecision,
    newProgPoint: string | undefined,
  ): Promise<void> {
    const reviewer = interaction.user;

    if (decision === 'approve') {
      const confirmed = await this.mutationService.buildConfirmedSignup(
        signup,
        newProgPoint,
      );
      await this.mutationService.applyApproval(confirmed, settings, reviewer);
      this.eventBus.publish(
        new SignupApprovedEvent(confirmed, settings, reviewer, reviewMessage),
      );
      return;
    }

    await this.mutationService.applyDecline(signup, reviewer);
    this.eventBus.publish(
      new SignupDeclinedEvent(signup, reviewer, reviewMessage),
    );
    this.declineReasonRequestService
      .requestDeclineReason(signup, reviewer, reviewMessage)
      .catch((error) => {
        this.logger.error(
          error,
          `Failed to request decline reason for edited signup ${signup.discordId}-${signup.encounter}`,
        );
      });
  }

  /** Only the rows that actually change, so neither embed overstates the edit. */
  private changedFields(diff: EditDiff) {
    const fields: { name: string; value: string; inline: boolean }[] = [];

    if (diff.oldProgPointLabel !== diff.newProgPointLabel) {
      fields.push({
        name: 'Prog Point',
        value: `${diff.oldProgPointLabel} → ${diff.newProgPointLabel}`,
        inline: false,
      });
    }

    if (diff.oldStatus !== diff.newStatus) {
      fields.push({
        name: 'Decision',
        value: `${diff.oldStatus} → ${diff.newStatus}`,
        inline: false,
      });
    }

    return fields;
  }

  private buildDiffEmbed(diff: EditDiff): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('Confirm Signup Edit')
      .setColor(Colors.Yellow)
      .addFields(this.changedFields(diff));
  }

  private buildSuccessEmbed(
    interaction: ChatInputCommandInteraction<'cached'>,
    diff: EditDiff,
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(EDIT_SIGNUP_MESSAGES.SUCCESS_TITLE)
      .setColor(Colors.Green)
      .setDescription(`Updated by ${interaction.user.displayName}`)
      .addFields(this.changedFields(diff));
  }

  private async replyError(
    interaction: ChatInputCommandInteraction<'cached'>,
    message: string,
  ): Promise<void> {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(message)],
      components: [],
    });
  }
}

export { EditSignupCommandHandler };
