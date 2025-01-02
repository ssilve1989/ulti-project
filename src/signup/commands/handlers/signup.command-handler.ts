import { Logger } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validate } from 'class-validator';
import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  Colors,
  ComponentType,
  DiscordjsErrorCodes,
  EmbedBuilder,
} from 'discord.js';
import { match } from 'ts-pattern';

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
import { UnhandledButtonInteractionException } from '../../../discord/discord.exceptions.js';
import { DiscordService } from '../../../discord/discord.service.js';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import { SentryTraced } from '../../../observability/span.decorator.js';
import { sentryReport } from '../../../sentry/sentry.consts.js';
import { SignupCreatedEvent } from '../../events/signup.events.js';
import { SignupInteractionDto } from '../../signup-interaction.dto.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';
import { shouldDeleteReviewMessageForSignup } from '../../signup.utils.js';
import { SignupCommand } from '../signup.commands.js';

// reusable object to clear a messages emebed + button interaction
const CLEAR_EMBED = {
  embeds: [],
  components: [],
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
  ) {}

  @SentryTraced()
  async execute({ interaction }: SignupCommand) {
    const { username } = interaction.user;

    this.logger.debug(`handling signup command for user: ${username}`);

    await interaction.deferReply({ ephemeral: true });

    const hasReviewChannelConfigured =
      !!(await this.settingsService.getReviewChannel(interaction.guildId));

    if (!hasReviewChannelConfigured) {
      await interaction.editReply(
        SIGNUP_MESSAGES.MISSING_SIGNUP_REVIEW_CHANNEL,
      );
      return;
    }

    const [signupRequest, validationErrors] =
      await this.createSignupRequest(interaction);

    if (validationErrors) {
      await interaction.editReply({
        embeds: [this.createValidationErrorsEmbed(validationErrors)],
      });
      return;
    }

    const embed = this.createSignupConfirmationEmbed(signupRequest);

    const confirmationRow = new ActionRowBuilder().addComponents(
      ConfirmButton,
      CancelButton,
    );

    const confirmationInteraction = await interaction.editReply({
      components: [confirmationRow as any], // the typings are wrong here? annoying af
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
          new SignupCreatedEvent(signup, interaction.guildId, {
            includeNotes: !!signupRequest.notes,
          }),
        );
      }
    } catch (e: unknown) {
      await this.handleError(e, interaction);
    }
  }

  private async handleConfirm(
    request: SignupInteractionDto,
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

  private async createSignupRequest({
    options,
    user,
  }: ChatInputCommandInteraction): Promise<
    [SignupInteractionDto, ValidationError[] | undefined]
  > {
    const request: SignupInteractionDto = {
      availability: options.getString('availability', true),
      character: options.getString('character', true),
      discordId: user.id,
      encounter: options.getString('encounter', true) as Encounter,
      notes: options.getString('notes') ?? undefined,
      proofOfProgLink: options.getString('prog-proof-link'),
      progPointRequested: options.getString('prog-point', true),
      role: options.getString('job', true),
      screenshot: options.getAttachment('screenshot')?.url ?? null,
      username: user.username,
      world: options.getString('world', true),
    };

    const transformed = plainToInstance(SignupInteractionDto, request);
    const errors = await validate(transformed);

    if (errors.length > 0) {
      return [transformed, errors];
    }

    return [transformed, undefined];
  }

  private createSignupConfirmationEmbed({
    availability,
    character,
    encounter,
    notes,
    proofOfProgLink,
    role,
    screenshot,
    world,
    progPointRequested,
  }: SignupInteractionDto) {
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
      .setDescription("Here's a summary of your request")
      .addFields(fields);

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

  private createValidationErrorsEmbed(errors: ValidationError[]) {
    const fields = errors.flatMap((error, index) => {
      const { constraints = {} } = error;

      return Object.entries(constraints).map(([, value]) => ({
        // The property names are ugly to present to the user. Alternatively we could use a dictionary to map the property names
        // to friendly names
        name: `Error #${index + 1}`,
        value,
      }));
    });

    const embed = new EmbedBuilder()
      .setTitle('Error')
      .setColor(Colors.Red)
      .setDescription('Please correct the following errors')
      .addFields(fields);

    return embed;
  }
}

export { SignupCommandHandler };
