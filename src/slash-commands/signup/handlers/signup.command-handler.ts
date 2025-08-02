import { URL } from 'node:url';
import { Logger } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ChatInputCommandInteraction,
  Colors,
  ComponentType,
  channelLink,
  DiscordjsErrorCodes,
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
import { UnhandledButtonInteractionException } from '../../../discord/discord.exceptions.js';
import { DiscordService } from '../../../discord/discord.service.js';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../../encounters/encounters.consts.js';
import { ErrorService } from '../../../error/error.service.js';
import { FFLogsService } from '../../../fflogs/fflogs.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SignupDocument } from '../../../firebase/models/signup.model.js';
import { SignupCommand } from '../commands/signup.commands.js';
import { SignupCreatedEvent } from '../events/signup.events.js';
import { SIGNUP_MESSAGES } from '../signup.consts.js';
import { type SignupSchema, signupSchema } from '../signup.schema.js';
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

// Channel ID for name update instructions
const NAME_UPDATE_CHANNEL_ID = '1264643007848906884';

type FFLogsValidationResult =
  | { success: true }
  | {
      success: false;
      errorMessage: string;
      errorType: 'format' | 'age' | 'api';
    };

@CommandHandler(SignupCommand)
class SignupCommandHandler implements ICommandHandler<SignupCommand> {
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

  @SentryTraced()
  async execute({ interaction }: SignupCommand) {
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
    const [signup, reviewChannelId] = await Promise.all([
      this.repository.upsert(request),
      this.settingsService.getReviewChannel(interaction.guildId),
    ]);

    if (signup?.reviewMessageId && reviewChannelId) {
      try {
        if (shouldDeleteReviewMessageForSignup(signup)) {
          await this.discordService.deleteMessage(
            interaction.guildId,
            reviewChannelId,
            signup.reviewMessageId,
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
    const encounter = options.getString('encounter', true) as Encounter;

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
        value: `Your Discord display name \`${displayName}\` doesn't match your submitted character name \`${titleCase(character)}\`. Please be sure this is correct before confirming.\n\nNames can be updated by visting the ${channelLink(NAME_UPDATE_CHANNEL_ID)} channel. Please refer to the pinned FAQ for more information.`,
        inline: false,
      });
    }

    return screenshot ? embed.setImage(screenshot) : embed;
  }

  private createValidationErrorsEmbed(error: ZodError): EmbedBuilder {
    const fields = error.issues.flatMap((issue, index) => {
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

  /**
   * Validates an FFLogs URL for security and report age requirements.
   *
   * This method performs comprehensive validation of FFLogs URLs to prevent
   * security vulnerabilities like URL spoofing while ensuring reports meet
   * age requirements for competitive integrity.
   *
   * Security considerations:
   * - Uses exact hostname matching to prevent subdomain spoofing attacks
   * - Validates URL format before attempting report code extraction
   * - Only accepts fflogs.com and www.fflogs.com as valid domains
   *
   * @param proofOfProgLink The URL string to validate, or null if none provided
   * @returns Promise<FFLogsValidationResult> - Validation result with success status and error details
   */
  private async validateFFLogsUrl(
    proofOfProgLink: string | null,
  ): Promise<FFLogsValidationResult> {
    if (!proofOfProgLink) {
      // Add FFLogs validation context for Sentry
      Sentry.setContext('fflogs_validation', {
        hasUrl: false,
        validationResult: 'success',
      });
      return { success: true }; // No URL to validate
    }

    try {
      const url = new URL(proofOfProgLink);
      const reportCode = extractFflogsReportCode(url);

      if (isFFLogsUrl(url) && !reportCode) {
        // Add FFLogs validation context for Sentry
        Sentry.setContext('fflogs_validation', {
          hasUrl: true,
          validationResult: 'format',
        });
        return {
          success: false,
          errorMessage: `Invalid FFLogs URL format. Please provide a valid link to a report. Not a profile or any other fflogs link.
            
            Example: https://www.fflogs.com/reports/2XG7tZp1AjQcWTn9?fight=3&type=damage-done
            `,
          errorType: 'format',
        };
      }

      if (reportCode) {
        // Only proceed with FFLogs validation if we successfully extracted a report code
        try {
          const fflogsValidation =
            await this.fflogsService.validateReportAge(reportCode);

          if (!fflogsValidation.isValid) {
            this.logger.log(fflogsValidation.errorMessage);

            // Add FFLogs validation context for Sentry
            Sentry.setContext('fflogs_validation', {
              hasUrl: true,
              validationResult: 'age',
            });
            return {
              success: false,
              errorMessage:
                fflogsValidation.errorMessage || 'FFLogs validation failed',
              errorType: 'age',
            };
          }
        } catch (error: unknown) {
          this.logger.warn('Error validating FFLogs report age:', error);
          // Add FFLogs validation context for Sentry
          Sentry.setContext('fflogs_validation', {
            hasUrl: true,
            validationResult: 'api',
          });
          return {
            success: false,
            errorMessage:
              'Unable to validate report age due to API issues. Report will be reviewed manually.',
            errorType: 'api',
          };
        }
      }

      // Add FFLogs validation context for Sentry (success case)
      Sentry.setContext('fflogs_validation', {
        hasUrl: true,
        validationResult: 'success',
      });
      return { success: true }; // Validation passed or no FFLogs URL provided
    } catch (_: unknown) {
      // Handle URL parsing errors
      // Add FFLogs validation context for Sentry
      Sentry.setContext('fflogs_validation', {
        hasUrl: true,
        validationResult: 'format',
      });
      return {
        success: false,
        errorMessage: 'Invalid URL format. Please provide a valid URL.',
        errorType: 'format',
      };
    }
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

    // Add signup request context for Sentry
    Sentry.setContext('signup_request', {
      encounter: signupRequest.encounter,
      character: signupRequest.character,
      world: signupRequest.world,
      progPointRequested: signupRequest.progPointRequested,
    });

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
      await this.handleConfirmationError(error, interaction);
    }
  }

  private async handleConfirmationError(
    error: unknown,
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    // Enhanced error handling with ErrorService
    const errorEmbed = this.errorService.handleCommandError(error, interaction);

    // Preserve Discord-specific error handling
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === DiscordjsErrorCodes.InteractionCollectorError) {
        await interaction.editReply({
          content: SIGNUP_MESSAGES.CONFIRMATION_TIMEOUT,
          embeds: [],
          components: [],
        });
        return;
      }
    }

    // Default error response
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

export { SignupCommandHandler };
