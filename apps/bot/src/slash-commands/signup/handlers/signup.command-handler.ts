import { URL } from 'node:url';
import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import type { SignupDocument } from '@ulti-project/shared';
import { EncounterFriendlyDescription } from '@ulti-project/shared';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ChatInputCommandInteraction,
  Colors,
  ComponentType,
  channelLink,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { titleCase } from 'title-case';
import { match } from 'ts-pattern';
import type { ZodError } from 'zod';
import { isSameUserFilter } from '../../../common/collection-filters.js';
import {
  CancelButton,
  ConfirmButton,
} from '../../../common/components/buttons.js';
import {
  characterField,
  emptyField,
  worldField,
} from '../../../common/components/fields.js';
import { createFields } from '../../../common/embed-helpers.js';
import { appConfig } from '../../../config/app.js';
import { UnhandledButtonInteractionException } from '../../../discord/discord.exceptions.js';
import { isCollectorTimeout } from '../../../discord/discord.helpers.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { FFLogsService } from '../../../fflogs/fflogs.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { SignupCreatedEvent } from '../events/signup.events.js';
import { SIGNUP_MESSAGES } from '../signup.consts.js';
import { type SignupSchema, signupSchema } from '../signup.schema.js';
import { createSignupSlashCommand } from '../signup.slash-command.js';
import {
  extractFflogsReportCode,
  isFFLogsUrl,
  shouldDeleteReviewMessageForSignup,
} from '../signup.utils.js';

// reusable object to clear a messages embed + button interaction
const CLEAR_EMBED = {
  embeds: [],
  components: [],
} as const;

// TODO: Make this configurable at runtime
const NAME_UPDATE_CHANNEL_ID = '1264643007848906884'; // Channel ID for name update instructions

type FFLogsValidationResult =
  | { success: true }
  | {
      success: false;
      errorMessage: string;
      errorType: 'format' | 'age';
    };

@Injectable()
@SlashCommand({ builder: createSignupSlashCommand(appConfig.APPLICATION_MODE) })
class SignupCommandHandler implements ISlashCommand {
  private readonly logger = new Logger(SignupCommandHandler.name);
  private static readonly SIGNUP_TIMEOUT = 60_000;

  constructor(
    private readonly eventBus: EventBus,
    private readonly repository: SignupCollection,
    private readonly settingsService: SettingsCollection,
    private readonly discordService: DiscordService,
    private readonly fflogsService: FFLogsService,
    private readonly errorService: ErrorService,
  ) {}

  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const { username } = interaction.user;

    this.logger.debug(`handling signup command for user: ${username}`);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Configuration validation
    const isValidConfig = await this.validateConfiguration(interaction);
    if (!isValidConfig) return;

    // Input validation
    const signupRequest = await this.validateSignupRequest(interaction);
    if (!signupRequest) return;

    // FFLogs validation
    const fflogsValidationResult = await this.validateFFLogsUrl(
      signupRequest.proofOfProgLink,
    );
    this.setFFLogsValidationContext(
      fflogsValidationResult,
      signupRequest.proofOfProgLink !== null,
    );

    if (!fflogsValidationResult.success) {
      await interaction.editReply({
        embeds: [
          this.createFFLogsValidationErrorEmbed(
            fflogsValidationResult.errorMessage,
          ),
        ],
      });
      return;
    }

    // Handle confirmation flow
    await this.handleConfirmationFlow(signupRequest, interaction);
  }

  private async handleConfirm(
    request: SignupSchema,
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<SignupDocument | undefined> {
    const [{ signup, previous }, reviewChannelId] = await Promise.all([
      this.repository.upsert(request),
      this.settingsService.getReviewChannel(interaction.guildId),
    ]);

    if (previous?.reviewMessageId && reviewChannelId) {
      try {
        // judge by the status before the upsert; the upserted signup is never APPROVED/DECLINED
        if (shouldDeleteReviewMessageForSignup(previous)) {
          await this.discordService.deleteMessage(
            interaction.guildId,
            reviewChannelId,
            previous.reviewMessageId,
          );
        }
      } catch (error: unknown) {
        this.errorService.captureError(error, {
          message: 'Failed to delete review message',
        });
      }
    }

    await interaction.editReply({
      content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CONFIRMED,
      ...CLEAR_EMBED,
    });

    return signup;
  }

  private async handleCancel(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.editReply({
      content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CANCELLED,
      ...CLEAR_EMBED,
    });
  }

  private createSignupRequest({
    options,
    user,
  }: ChatInputCommandInteraction):
    | [SignupSchema, undefined]
    | [undefined, ZodError<SignupSchema>] {
    const encounter = options.getString('encounter', true);

    const request = {
      character: options.getString('character', true),
      discordId: user.id,
      encounter,
      notes: options.getString('notes'),
      proofOfProgLink: options.getString('prog-proof-link'),
      progPointRequested: options.getString('prog-point', true),
      role: options.getString('job', true),
      screenshot: options.getAttachment('screenshot')?.url,
      username: user.username,
      world: options.getString('world', true),
    };

    const result = signupSchema.safeParse(request);

    if (!result.success) {
      return [undefined, result.error];
    }

    return [result.data, undefined];
  }

  private createSignupConfirmationEmbed(
    {
      character,
      encounter,
      notes,
      proofOfProgLink,
      role,
      screenshot,
      world,
      progPointRequested,
    }: SignupSchema,
    displayName: string,
  ): EmbedBuilder {
    const fields = createFields([
      characterField(character),
      worldField(world, 'Home World'),
      { name: 'Job', value: role, inline: true },
      { name: 'Prog Point', value: progPointRequested, inline: true },
      emptyField(),
      { name: 'Prog Proof Link', value: proofOfProgLink, inline: true },
      { name: 'Notes', value: notes, inline: false },
    ]);

    const embed = new EmbedBuilder()
      .setTitle(EncounterFriendlyDescription[encounter])
      .setDescription("Here's a summary of your signup request")
      .addFields(fields);

    if (displayName.toLowerCase().trim() !== character.trim()) {
      // display a warning that their name does not match. it could be a spelling mistake
      embed.addFields({
        name: '⚠️ Name Mismatch Warning',
        value: `Your Discord display name \`${displayName}\` doesn't match your submitted character name \`${titleCase(character)}\`. **This reduces your chances of being picked for a run.** Please be sure this is correct before confirming.\n\nNames can be updated by visiting the ${channelLink(NAME_UPDATE_CHANNEL_ID)} channel. Please refer to the pinned FAQ for more information.`,
        inline: false,
      });
    }

    return screenshot ? embed.setImage(screenshot) : embed;
  }

  private createValidationErrorsEmbed(error: ZodError): EmbedBuilder {
    const fields = error.issues.map((issue, index) => {
      const { message } = issue;

      return {
        // The property names are ugly to present to the user. Alternatively we could use a dictionary to map the property names
        // to friendly names
        name: `Error #${index + 1}`,
        value: message,
      };
    });

    const embed = new EmbedBuilder()
      .setTitle('Error')
      .setColor(Colors.Red)
      .setDescription('Please correct the following errors')
      .addFields(fields);

    return embed;
  }

  private createFFLogsValidationErrorEmbed(errorMessage: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('❌ FFLogs Check Failed')
      .setDescription(errorMessage)
      .setTimestamp();
  }

  private async validateFFLogsUrl(
    proofOfProgLink: string | null,
  ): Promise<FFLogsValidationResult> {
    if (!proofOfProgLink) {
      return { success: true };
    }

    const url = new URL(proofOfProgLink);
    const reportCode = extractFflogsReportCode(url);

    if (isFFLogsUrl(url) && !reportCode) {
      return {
        success: false,
        errorMessage: `Invalid FFLogs URL format. Please provide a valid link to a report. Not a profile or any other fflogs link.

            Example: https://www.fflogs.com/reports/2XG7tZp1AjQcWTn9?fight=3&type=damage-done
            `,
        errorType: 'format',
      };
    }

    if (reportCode) {
      const fflogsValidation =
        await this.fflogsService.validateReportAge(reportCode);

      if (!fflogsValidation.isValid) {
        this.logger.log(fflogsValidation.errorMessage);

        return {
          success: false,
          errorMessage:
            fflogsValidation.errorMessage || 'FFLogs validation failed',
          errorType: 'age',
        };
      }
    }

    return { success: true };
  }

  private setFFLogsValidationContext(
    result: FFLogsValidationResult,
    hasUrl: boolean,
  ): void {
    const scope = Sentry.getCurrentScope();
    scope.setContext('fflogs_validation', {
      hasUrl,
      validationResult: result.success ? 'success' : result.errorType,
    });
  }

  private async validateConfiguration(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<boolean> {
    const hasReviewChannelConfigured =
      !!(await this.settingsService.getReviewChannel(interaction.guildId));

    if (!hasReviewChannelConfigured) {
      await interaction.editReply(
        SIGNUP_MESSAGES.MISSING_SIGNUP_REVIEW_CHANNEL,
      );
      return false;
    }

    return true;
  }

  private async validateSignupRequest(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<SignupSchema | null> {
    const [signupRequest, validationErrors] =
      this.createSignupRequest(interaction);

    if (validationErrors) {
      await interaction.editReply({
        embeds: [this.createValidationErrorsEmbed(validationErrors)],
      });
      return null;
    }

    return signupRequest;
  }

  private async handleConfirmationFlow(
    signupRequest: SignupSchema,
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const displayName = await this.discordService.getDisplayName({
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });

    const embed = this.createSignupConfirmationEmbed(
      signupRequest,
      displayName,
    );
    const confirmationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ConfirmButton,
      CancelButton,
    );

    const confirmationInteraction = await interaction.editReply({
      components: [confirmationRow],
      embeds: [embed],
    });

    try {
      const response = await Sentry.startSpan(
        { name: 'awaitConfirmationInteraction' },
        () => {
          return confirmationInteraction.awaitMessageComponent<ComponentType.Button>(
            {
              filter: isSameUserFilter(interaction.user),
              time: SignupCommandHandler.SIGNUP_TIMEOUT,
            },
          );
        },
      );

      await response.deferUpdate();

      const signup = await match(response)
        .with({ customId: 'confirm' }, () =>
          this.handleConfirm(signupRequest, interaction),
        )
        .with({ customId: 'cancel' }, () => this.handleCancel(interaction))
        .otherwise(() => {
          throw new UnhandledButtonInteractionException(response);
        });

      if (signup) {
        this.eventBus.publish(
          new SignupCreatedEvent(signup, interaction.guildId),
        );
      }
    } catch (error: unknown) {
      // the user didn't click confirm or cancel before the prompt expired
      if (!isCollectorTimeout(error)) throw error;

      this.errorService.captureError(error);
      await interaction.editReply({
        content: SIGNUP_MESSAGES.CONFIRMATION_TIMEOUT,
        ...CLEAR_EMBED,
      });
    }
  }
}

export { SignupCommandHandler };
