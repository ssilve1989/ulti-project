import { Logger } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { capitalCase } from 'change-case';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validate } from 'class-validator';
import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  Colors,
  ComponentType,
  DiscordjsError,
  DiscordjsErrorCodes,
  EmbedBuilder,
} from 'discord.js';
import { P, match } from 'ts-pattern';
import { isSameUserFilter } from '../../common/collection-filters.js';
import {
  CancelButton,
  ConfirmButton,
} from '../../common/components/buttons.js';
import { UnhandledButtonInteractionException } from '../../discord/discord.exceptions.js';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { sentryReport } from '../../sentry/sentry.consts.js';
import { SignupInteractionDto } from './signup-interaction.dto.js';
import { SignupCommand } from './signup.commands.js';
import { SIGNUP_MESSAGES } from './signup.consts.js';
import { SignupCreatedEvent } from './signup.events.js';

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
  ) {}

  async execute({ interaction }: SignupCommand) {
    const { username } = interaction.user;

    this.logger.log(`handling signup command for user: ${username}`);

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

    const ConfirmationRow = new ActionRowBuilder().addComponents(
      ConfirmButton,
      CancelButton,
    );

    const confirmationInteraction = await interaction.editReply({
      components: [ConfirmationRow as any], // the typings are wrong here? annoying af
      embeds: [embed],
    });
    try {
      const response =
        await confirmationInteraction.awaitMessageComponent<ComponentType.Button>(
          {
            filter: isSameUserFilter(interaction.user),
            time: SignupCommandHandler.SIGNUP_TIMEOUT,
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

      this.logger.debug({
        message: `signup ${response.customId}`,
        ...signupRequest,
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
    request: SignupInteractionDto,
    interaction: ChatInputCommandInteraction,
  ) {
    const signup = this.repository.createSignup(request);

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
    // the fields that are marked required should come in with values. empty strings are not allowed
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const request: SignupInteractionDto = {
      availability: options.getString('availability')!,
      character: options.getString('character')!,
      discordId: user.id,
      encounter: options.getString('encounter')! as Encounter,
      fflogsLink: options.getString('fflogs'),
      role: options.getString('job')!,
      screenshot: options.getAttachment('screenshot')?.url,
      username: user.username,
      world: options.getString('world')!,
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
    fflogsLink,
    role,
    screenshot,
    world,
  }: SignupInteractionDto) {
    let embed = new EmbedBuilder()
      .setTitle(EncounterFriendlyDescription[encounter])
      .setDescription("Here's a summary of your request")
      .addFields([
        {
          name: 'Character',
          value: capitalCase(character),
          inline: true,
        },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: 'Home World', value: capitalCase(world), inline: true },
        { name: 'Availability', value: availability, inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: 'Role', value: role, inline: true },
      ]);

    if (fflogsLink) {
      embed = embed.addFields([
        {
          name: 'FF Logs Link',
          value: `[View Report](${fflogsLink})`,
          inline: true,
        },
      ]);
    }

    if (screenshot) {
      embed = embed.setImage(screenshot);
    }

    return embed;
  }

  private handleError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
  ) {
    sentryReport(error, {
      userId: interaction.user.id,
      extra: { command: interaction.command?.name },
    });

    this.logger.error(error);

    return match(error)
      .with(
        P.instanceOf(DiscordjsError),
        ({ code }) => code === DiscordjsErrorCodes.InteractionCollectorError,
        () =>
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
