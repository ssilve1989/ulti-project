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
import { isSameUserFilter } from '../../../../common/collection-filters.js';
import {
  CancelButton,
  ConfirmButton,
} from '../../../../common/components/buttons.js';
import {
  characterField,
  worldField,
} from '../../../../common/components/fields.js';
import { createFields } from '../../../../common/embed-helpers.js';
import { UnhandledButtonInteractionException } from '../../../../discord/discord.exceptions.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../../../encounters/encounters.consts.js';
import { FFLogsService } from '../../../../fflogs/fflogs.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../../firebase/collections/signup.collection.js';
import { sentryReport } from '../../../../sentry/sentry.consts.js';
import { SignupCreatedEvent } from '../../events/signup.events.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';
import { type SignupSchema, signupSchema } from '../../signup.schema.js';
import {
  extractFflogsReportCode,
  isFFLogsUrl,
  shouldDeleteReviewMessageForSignup,
} from '../../signup.utils.js';
import { SignupCommand } from '../signup.commands.js';

// reusable object to clear a messages emebed + button interaction
const CLEAR_EMBED = {
  embeds: [],
  components: [],
};

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
  ) {}

  @SentryTraced()
  async execute({ interaction }: SignupCommand) {
    const { username } = interaction.user;

    this.logger.debug(`handling signup command for user: ${username}`);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const hasReviewChannelConfigured =
      !!(await this.settingsService.getReviewChannel(interaction.guildId));

    if (!hasReviewChannelConfigured) {
      await interaction.editReply(
        SIGNUP_MESSAGES.MISSING_SIGNUP_REVIEW_CHANNEL,
      );
      return;
    }

    const [signupRequest, validationErrors] =
      this.createSignupRequest(interaction);

    if (validationErrors) {
      await interaction.editReply({
        embeds: [this.createValidationErrorsEmbed(validationErrors)],
      });
      return;
    }

    // Perform FFLogs validation if applicable
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
    } catch (e: unknown) {
      await this.handleError(e, interaction);
    }
  }

  private async handleConfirm(
    request: SignupSchema,
    interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {
    const [existing, reviewChannelId] = await Promise.all([
      this.repository.findById(SignupCollection.getKeyForSignup(request)),
      this.settingsService.getReviewChannel(interaction.guildId),
    ]);

    // quick and dirty way to delete the prior signup approval they might have had stored
    if (existing?.reviewMessageId && reviewChannelId) {
      try {
        shouldDeleteReviewMessageForSignup(existing) &&
          (await this.discordService.deleteMessage(
            interaction.guildId,
            reviewChannelId,
            existing.reviewMessageId,
          ));
      } catch (e) {
        this.logger.error(e);
      }
    }

    const signup = await this.repository.upsert(request);

    await interaction.editReply({
      content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CONFIRMED,
      ...CLEAR_EMBED,
    });

    return signup;
  }

  private async handleCancel(interaction: ChatInputCommandInteraction) {
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
    const request = {
      availability: options.getString('availability', true),
      character: options.getString('character', true),
      discordId: user.id,
      encounter: options.getString('encounter', true) as Encounter,
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
      availability,
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
  ) {
    const fields = createFields([
      characterField(character),
      worldField(world, 'Home World'),
      { name: 'Job', value: role, inline: true },
      { name: 'Prog Point', value: progPointRequested, inline: true },
      { name: 'Availability', value: availability, inline: true },
      { name: 'Prof Proof Link', value: proofOfProgLink, inline: true },
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
        value: `Your Discord display name \`${displayName}\` doesn't match your submitted character name \`${titleCase(character)}\`. Please be sure this is correct before confirming.\n\nNames can be updated by visting the ${channelLink('1264643007848906884')} channel. Please refer to the pinned FAQ for more information.`,
        inline: false,
      });
    }

    return screenshot ? embed.setImage(screenshot) : embed;
  }

  private handleError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
  ) {
    sentryReport(error);
    this.logger.error(error);

    return match(error)
      .with({ code: DiscordjsErrorCodes.InteractionCollectorError }, () =>
        interaction.editReply({
          content: SIGNUP_MESSAGES.CONFIRMATION_TIMEOUT,
          ...CLEAR_EMBED,
        }),
      )
      .otherwise(() =>
        interaction.editReply({
          content: 'Sorry an unexpected error has occurred',
          ...CLEAR_EMBED,
        }),
      );
  }

  private createValidationErrorsEmbed(error: ZodError) {
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

  private createFFLogsValidationErrorEmbed(errorMessage: string) {
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
      return { success: true }; // No URL to validate
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
      // Only proceed with FFLogs validation if we successfully extracted a report code
      try {
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
      } catch (error) {
        this.logger.warn('Error validating FFLogs report age:', error);
        return {
          success: false,
          errorMessage:
            'Unable to validate report age due to API issues. Report will be reviewed manually.',
          errorType: 'api',
        };
      }
    }

    return { success: true }; // Validation passed or no FFLogs URL provided
  }
}

export { SignupCommandHandler };
