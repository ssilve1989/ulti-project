import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { ProgPointDocument, SignupDocument } from '@ulti-project/shared';
import {
  ActionRowBuilder,
  type ButtonInteraction,
  ChatInputCommandInteraction,
  DiscordAPIError,
  DiscordjsErrorCodes,
  type EmbedBuilder,
  type Message,
  type MessageComponentInteraction,
  MessageFlags,
  messageLink,
  type StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { Timestamp } from 'firebase-admin/firestore';
import { match } from 'ts-pattern';
import { isSameUserFilter } from '../../../common/collection-filters.js';
import { appConfig } from '../../../config/app.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { EncountersService } from '../../../encounters/encounters.service.js';
import { EncountersComponentsService } from '../../../encounters/encounters-components.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  APPROVAL_COMMENT_INPUT_ID,
  createApprovalCommentModal,
} from '../../signup/approval-decision.components.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import {
  createEditButtonsRow,
  createEditConflictEmbed,
  createEditGuardEmbed,
  createEditSavedEmbed,
  createEditScreenEmbed,
  markSelectedProgPoint,
} from '../edit-signup.components.js';
import {
  DISCORD_UNKNOWN_INTERACTION,
  EDIT_CANCEL_BUTTON_ID,
  EDIT_SAVE_BUTTON_ID,
  EDIT_SAVE_WITH_COMMENT_BUTTON_ID,
  EDIT_SIGNUP_MESSAGES,
  EDIT_SIGNUP_TIMEOUT_MS,
  notFoundMessage,
  reviewPendingMessage,
  sheetsErrorMessage,
} from '../edit-signup.consts.js';
import {
  buildEditPreview,
  type EditKind,
  type EditPreview,
  type EditSelection,
  getEditability,
} from '../edit-signup.policy.js';
import { editSignupSchema } from '../edit-signup.schema.js';
import {
  type ApplyEditResult,
  EditSignupService,
} from '../edit-signup.service.js';
import { createEditSignupSlashCommand } from '../edit-signup.slash-command.js';

interface EditContext {
  interaction: ChatInputCommandInteraction<'cached'>;
  signup: SignupDocument;
  updateTime: Timestamp;
  kind: EditKind;
  settings: SettingsDocument;
  reviewMessageUrl?: string;
  announcementExists: boolean;
  progPoints: ReadonlyMap<string, ProgPointDocument>;
  progPointLabels: ReadonlyMap<string, string>;
}

interface ScreenState {
  selection?: EditSelection;
  preview?: EditPreview;
  // bumped on every "… with Comment" click, so a modal listener left parked
  // by an earlier click can tell it is stale
  modalGeneration: number;
}

interface CommitOutcome {
  type: 'commit';
  selection: EditSelection;
  preview: EditPreview;
  comment?: string;
}

type EditOutcome = CommitOutcome | { type: 'cancelled' } | { type: 'timedOut' };

@Injectable()
@SlashCommand({
  builder: createEditSignupSlashCommand(appConfig.APPLICATION_MODE),
})
class EditSignupCommandHandler implements ISlashCommand {
  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
    private readonly signupCollection: SignupCollection,
    private readonly encountersService: EncountersService,
    private readonly encountersComponentsService: EncountersComponentsService,
    private readonly editSignupService: EditSignupService,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const context = await this.loadContext(interaction);

      if (context) {
        await this.runEditScreen(context);
      }
    } catch (error) {
      const embed = this.errorService.handleCommandError(error, interaction);
      await interaction.editReply({
        content: '',
        embeds: [embed],
        components: [],
      });
    }
  }

  private async loadContext(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<EditContext | undefined> {
    const { discordId, encounter } = editSignupSchema.parse({
      discordId: interaction.options.getUser('user', true).id,
      encounter: interaction.options.getString('encounter', true),
    });

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    if (!settings?.reviewerRole) {
      return this.replyGuard(
        interaction,
        EDIT_SIGNUP_MESSAGES.MISSING_REVIEWER_ROLE,
      );
    }

    const isReviewer = await this.discordService.userHasRole({
      userId: interaction.user.id,
      roleId: settings.reviewerRole,
      guildId: interaction.guildId,
    });

    if (!isReviewer) {
      return this.replyGuard(interaction, EDIT_SIGNUP_MESSAGES.NOT_A_REVIEWER);
    }

    const found = await this.signupCollection.findByKeyWithVersion({
      discordId,
      encounter,
    });

    if (!found) {
      return this.replyGuard(
        interaction,
        notFoundMessage(discordId, encounter),
      );
    }

    const reviewMessageUrl = getReviewMessageUrl(
      found.signup,
      settings,
      interaction.guildId,
    );
    const editability = getEditability(found.signup, settings);

    if (!editability.editable) {
      return this.replyGuard(
        interaction,
        editabilityGuardMessage(editability.reason, reviewMessageUrl),
      );
    }

    const [progPoints, announcementExists] = await Promise.all([
      this.encountersService.getProgPoints(encounter),
      this.checkAnnouncementExists(
        interaction.guildId,
        editability.kind,
        settings.signupChannel,
        found.signup.approvalMessageId,
      ),
    ]);

    return {
      interaction,
      signup: found.signup,
      updateTime: found.updateTime,
      kind: editability.kind,
      settings,
      reviewMessageUrl,
      announcementExists,
      progPoints: new Map(
        progPoints.map((progPoint) => [progPoint.id, progPoint]),
      ),
      progPointLabels: new Map(
        progPoints.map((progPoint) => [progPoint.id, progPoint.label]),
      ),
    };
  }

  private async checkAnnouncementExists(
    guildId: string,
    kind: EditKind,
    signupChannel: string | undefined,
    approvalMessageId: string | undefined,
  ): Promise<boolean> {
    if (kind !== 'correction' || !signupChannel || !approvalMessageId) {
      return true;
    }

    const message = await this.discordService.fetchMessage(
      guildId,
      signupChannel,
      approvalMessageId,
    );

    return message !== undefined;
  }

  private async replyGuard(
    interaction: ChatInputCommandInteraction<'cached'>,
    message: string,
  ): Promise<undefined> {
    await interaction.editReply({ embeds: [createEditGuardEmbed(message)] });
    return undefined;
  }

  private async runEditScreen(context: EditContext): Promise<void> {
    const menu =
      await this.encountersComponentsService.createProgPointSelectMenu(
        context.signup.encounter,
        { includeCleared: false },
      );

    // a correction starts on the current prog point; a reversal must choose
    markSelectedProgPoint(
      menu,
      context.kind === 'correction' ? context.signup.progPoint : undefined,
    );

    const state: ScreenState = { modalGeneration: 0 };
    const message = await context.interaction.editReply(
      this.renderScreen(context, menu, state),
    );
    const outcome = await this.collectOutcome(context, message, menu, state);

    await this.finish(context, outcome);
  }

  private renderScreen(
    context: EditContext,
    menu: StringSelectMenuBuilder,
    { preview }: ScreenState,
  ) {
    return {
      embeds: [createEditScreenEmbed({ ...context, preview })],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
        createEditButtonsRow(context.kind, !preview?.hasChanges),
      ],
    };
  }

  // One collector for the whole screen, as in
  // ApprovalDecisionRequestService.collectDecision: repeated
  // awaitMessageComponent() calls leave gaps where a fast click is dropped.
  private collectOutcome(
    context: EditContext,
    message: Message,
    menu: StringSelectMenuBuilder,
    state: ScreenState,
  ): Promise<EditOutcome> {
    const deadline = Date.now() + EDIT_SIGNUP_TIMEOUT_MS;

    return new Promise<EditOutcome>((resolve, reject) => {
      let settled = false;

      const collector = message.createMessageComponentCollector({
        filter: isSameUserFilter(context.interaction.user),
        time: EDIT_SIGNUP_TIMEOUT_MS,
      });

      const settle = (action: () => void) => {
        settled = true;
        collector.stop();
        action();
      };

      collector.on('collect', async (componentInteraction) => {
        try {
          const outcome = await this.processInteraction(
            context,
            componentInteraction,
            menu,
            state,
            deadline,
          );

          if (outcome) {
            settle(() => resolve(outcome));
          }
        } catch (error) {
          settle(() => reject(error));
        }
      });

      collector.on('end', () => {
        if (!settled) {
          resolve({ type: 'timedOut' });
        }
      });
    });
  }

  private async processInteraction(
    context: EditContext,
    interaction: MessageComponentInteraction,
    menu: StringSelectMenuBuilder,
    state: ScreenState,
    deadline: number,
  ): Promise<EditOutcome | undefined> {
    if (interaction.isStringSelectMenu()) {
      await this.updateSelection(context, interaction, menu, state);
      return undefined;
    }

    if (!interaction.isButton()) {
      return undefined;
    }

    if (interaction.customId === EDIT_CANCEL_BUTTON_ID) {
      await interaction.update({
        content: EDIT_SIGNUP_MESSAGES.CANCELLED,
        embeds: [],
        components: [],
      });
      return { type: 'cancelled' };
    }

    const commit = commitFrom(state);

    // commit buttons are disabled until the preview shows a change
    if (!commit) {
      return undefined;
    }

    if (interaction.customId === EDIT_SAVE_WITH_COMMENT_BUTTON_ID) {
      return this.collectComment(interaction, state, deadline);
    }

    if (interaction.customId === EDIT_SAVE_BUTTON_ID) {
      // acknowledge immediately: saving can outlast Discord's 3s window
      await interaction.update({
        content: EDIT_SIGNUP_MESSAGES.SAVING,
        embeds: [],
        components: [],
      });
      return commit;
    }

    return undefined;
  }

  private async updateSelection(
    context: EditContext,
    interaction: StringSelectMenuInteraction,
    menu: StringSelectMenuBuilder,
    state: ScreenState,
  ): Promise<void> {
    const progPoint = context.progPoints.get(interaction.values.at(0) ?? '');

    if (progPoint) {
      state.selection = {
        progPoint: progPoint.id,
        partyStatus: progPoint.partyStatus,
      };
      state.preview = buildEditPreview({
        ...context,
        selection: state.selection,
      });
      markSelectedProgPoint(menu, progPoint.id);
    }

    await interaction.update(this.renderScreen(context, menu, state));
  }

  private async collectComment(
    interaction: ButtonInteraction,
    state: ScreenState,
    deadline: number,
  ): Promise<EditOutcome | undefined> {
    // discord.js has no "modal closed" event: a modal dismissed with Esc
    // leaves its submit listener parked on this message, so a later click's
    // submit reaches both listeners and only the newest click may act on it
    state.modalGeneration += 1;
    const generation = state.modalGeneration;

    try {
      await interaction.showModal(createApprovalCommentModal());
    } catch (error) {
      if (
        error instanceof DiscordAPIError &&
        error.code === DISCORD_UNKNOWN_INTERACTION
      ) {
        // recoverable: the collector is still running, so a second click
        // arrives with a fresh interaction token
        await interaction.user.send(EDIT_SIGNUP_MESSAGES.MODAL_TOKEN_EXPIRED);
        return undefined;
      }
      throw error;
    }

    const modal = await this.awaitComment(interaction, deadline);

    if (!modal) {
      // the outer collector's own 'end' event reports the timeout
      return undefined;
    }

    // built at submit time, never from values captured at click time
    const commit = commitFrom(state);

    if (generation !== state.modalGeneration || !commit) {
      // stale listener: the newest click's own listener handles this submit
      return undefined;
    }

    if (modal.isFromMessage()) {
      await modal.update({
        content: EDIT_SIGNUP_MESSAGES.SAVING,
        embeds: [],
        components: [],
      });
    }

    const comment = modal.fields
      .getTextInputValue(APPROVAL_COMMENT_INPUT_ID)
      .trim();

    return { ...commit, comment: comment || undefined };
  }

  // Resolves to the reviewer's modal submission, or `undefined` if the
  // outer screen's timeout fires first (discord.js has no "modal closed"
  // event, so this collector keeps waiting until either the modal is
  // submitted or its own timer expires).
  private async awaitComment(interaction: ButtonInteraction, deadline: number) {
    try {
      return await interaction.awaitModalSubmit({
        // scoped to this button's message too: an unresolved listener from a
        // prior screen would otherwise still match on user alone and could
        // grab a modal submit meant for a different edit screen
        filter: (modalInteraction) =>
          isSameUserFilter(interaction.user)(modalInteraction) &&
          modalInteraction.message?.id === interaction.message.id,
        // floor of 1: discord.js only arms its timer for a truthy `time`
        time: Math.max(deadline - Date.now(), 1),
      });
    } catch (error) {
      if (isCollectorTimeoutError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  private async finish(
    context: EditContext,
    outcome: EditOutcome,
  ): Promise<void> {
    if (outcome.type === 'cancelled') {
      return;
    }

    if (outcome.type === 'timedOut') {
      await context.interaction.editReply({
        content: EDIT_SIGNUP_MESSAGES.TIMED_OUT,
        embeds: [],
        components: [],
      });
      return;
    }

    const result = await this.editSignupService.apply({
      kind: context.kind,
      signup: context.signup,
      updateTime: context.updateTime,
      progPoint: outcome.selection.progPoint,
      editor: context.interaction.user,
      comment: outcome.comment,
      settings: context.settings,
      guildId: context.interaction.guildId,
    });

    await context.interaction.editReply({
      content: '',
      components: [],
      embeds: [createResultEmbed(context, outcome, result)],
    });
  }
}

// Structural check rather than `instanceof DiscordjsError`, matching
// SignupCommandHandler.handleConfirmationError: awaitModalSubmit's rejection
// is a real DiscordjsError at runtime, but that class's constructor is
// TS-private, so tests stand in a plain `{ code }` shape instead.
function isCollectorTimeoutError(
  error: unknown,
): error is { code: DiscordjsErrorCodes.InteractionCollectorError } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === DiscordjsErrorCodes.InteractionCollectorError
  );
}

function commitFrom({
  selection,
  preview,
}: ScreenState): CommitOutcome | undefined {
  return selection && preview?.hasChanges
    ? { type: 'commit', selection, preview }
    : undefined;
}

function editabilityGuardMessage(
  reason: 'reviewPending' | 'announcementNotLinked',
  reviewMessageUrl: string | undefined,
): string {
  return match(reason)
    .with('reviewPending', () => reviewPendingMessage(reviewMessageUrl))
    .with(
      'announcementNotLinked',
      () => EDIT_SIGNUP_MESSAGES.ANNOUNCEMENT_NOT_LINKED,
    )
    .exhaustive();
}

function getReviewMessageUrl(
  { reviewMessageId }: SignupDocument,
  { reviewChannel }: SettingsDocument,
  guildId: string,
): string | undefined {
  return reviewMessageId && reviewChannel
    ? messageLink(reviewChannel, reviewMessageId, guildId)
    : undefined;
}

function createResultEmbed(
  { signup, progPointLabels }: EditContext,
  { selection, preview }: CommitOutcome,
  result: ApplyEditResult,
): EmbedBuilder {
  return match(result)
    .with({ type: 'saved' }, () => createEditSavedEmbed(preview))
    .with({ type: 'savedWithSheetsError' }, () =>
      createEditSavedEmbed(
        preview,
        sheetsErrorMessage(
          signup.character,
          selection.partyStatus,
          progPointLabels.get(selection.progPoint) ?? selection.progPoint,
        ),
      ),
    )
    .with({ type: 'conflict' }, () => createEditConflictEmbed())
    .exhaustive();
}

export { EditSignupCommandHandler };
