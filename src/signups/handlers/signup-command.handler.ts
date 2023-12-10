import { Logger } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ComponentType,
  DiscordjsError,
  DiscordjsErrorCodes,
  EmbedBuilder,
} from 'discord.js';
import { P, match } from 'ts-pattern';
import { Encounter, EncounterFriendlyDescription } from '../../app.consts.js';
import { isSameUserFilter } from '../../interactions/interactions.filters.js';
import { SignupCommand } from '../signup.commands.js';
import {
  CancelButton,
  ConfirmButton,
  SIGNUP_MESSAGES,
} from '../signup.consts.js';
import { SignupEvent } from '../signup.events.js';
import { UnhandledButtonInteractionException } from '../signup.exceptions.js';
import { SignupRequest } from '../signup.interfaces.js';
import { SignupRepository } from '../signup.repository.js';

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
    private readonly repository: SignupRepository,
  ) {}

  async execute({ interaction }: SignupCommand) {
    const username = interaction.user.username;
    this.logger.log(`handling signup command for user: ${username}`);

    await interaction.deferReply({ ephemeral: true });

    // the fields are marked required so they should come in with values. empty strings are not allowed
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const request = this.createSignupRequest(interaction);

    // TODO: Additional validation could be done on the data here now but would require a followup message
    // if any action is required from the user. For now, we'll just assume the data will be understood by the
    // coordinators reviewing the submission
    const embed = this.createSignupConfirmationEmbed(request);

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
            filter: isSameUserFilter(interaction),
            time: SignupCommandHandler.SIGNUP_TIMEOUT,
          },
        );

      const signup = await match(response)
        .with({ customId: 'confirm' }, () =>
          this.handleConfirm(request, interaction),
        )
        .with({ customId: 'cancel' }, () => this.handleCancel(interaction))
        .otherwise(() => {
          throw new UnhandledButtonInteractionException(response);
        });

      this.logger.log({
        message: `signup ${response.customId}`,
        ...request,
      });

      if (signup) {
        this.eventBus.publish(new SignupEvent(signup));
      }
    } catch (e: unknown) {
      await this.handleError(e, interaction);
    }
  }

  private async handleConfirm(
    request: SignupRequest,
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

  private createSignupRequest(
    interaction: ChatInputCommandInteraction,
  ): SignupRequest {
    return {
      availability: interaction.options.getString('availability')!,
      character: interaction.options.getString('character')!,
      discordId: interaction.user.id,
      encounter: interaction.options.getString('encounter')! as Encounter,
      fflogsLink: interaction.options.getString('fflogs')!,
      world: interaction.options.getString('world')!,
      username: interaction.user.username,
    };
  }

  private createSignupConfirmationEmbed({
    availability,
    character,
    encounter,
    fflogsLink,
    world,
  }: SignupRequest) {
    const embed = new EmbedBuilder()
      .setTitle(`${EncounterFriendlyDescription[encounter]} Signup`)
      .setDescription("Here's a summary of your request")
      .addFields([
        { name: 'Character', value: character },
        { name: 'Home World', value: world },
        { name: 'FF Logs Link', value: `[Click Here](${fflogsLink})` },
        { name: 'Availability', value: availability },
      ]);

    return embed;
  }

  private handleError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
  ) {
    this.logger.error(error);

    return match(error)
      .with(
        P.instanceOf(DiscordjsError),
        ({ code }) => code === DiscordjsErrorCodes.InteractionCollectorError,
        () => {
          return interaction.editReply({
            content: SIGNUP_MESSAGES.CONFIRMATION_TIMEOUT,
            ...CLEAR_EMBED,
          });
        },
      )
      .otherwise(() => {
        return interaction.editReply({
          content: 'Sorry an unexpected error has occurred',
          ...CLEAR_EMBED,
        });
      });
  }
}

export { SignupCommandHandler };
