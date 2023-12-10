import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  DiscordjsError,
  DiscordjsErrorCodes,
  EmbedBuilder,
} from 'discord.js';
import { P, match } from 'ts-pattern';
import { Encounter, EncounterFriendlyDescription } from '../../app.consts.js';
import { isSameUserFilter } from '../../interactions/interactions.filters.js';
import {
  CancelButton,
  ConfirmButton,
  SIGNUP_MESSAGES,
} from '../signup.consts.js';
import { SignupRequest } from '../signup.interfaces.js';
import { SignupCommand } from '../signup.command.js';
import { SignupService } from '../signup.service.js';

// reusable object to clear a messages emebed + button interaction
const CLEAR_EMBED = {
  embeds: [],
  components: [],
};

@CommandHandler(SignupCommand)
class SignupCommandHandler implements ICommandHandler<SignupCommand> {
  private readonly logger = new Logger(SignupCommandHandler.name);
  private static readonly SIGNUP_TIMEOUT = 60_000;

  constructor(private readonly signupService: SignupService) {}

  async execute({ interaction }: SignupCommand) {
    const username = interaction.user.username;
    this.logger.log(`handling signup command for user: ${username}`);

    await interaction.deferReply({ ephemeral: true });

    // the fields are marked required so they should come in with values. empty strings are not allowed
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const signup: SignupRequest = {
      availability: interaction.options.getString('availability')!,
      character: interaction.options.getString('character')!,
      discordId: interaction.user.id,
      encounter: interaction.options.getString('encounter')! as Encounter,
      fflogsLink: interaction.options.getString('fflogs')!,
      world: interaction.options.getString('world')!,
      username,
    };

    // TODO: Additional validation could be done on the data here now but would require a followup message
    // if any action is required from the user. For now, we'll just assume the data will be understood by the
    // coordinators reviewing the submission
    const embed = this.createSummaryEmbed(signup);

    const ConfirmationRow = new ActionRowBuilder().addComponents(
      ConfirmButton,
      CancelButton,
    );

    const confirmationInteraction = await interaction.editReply({
      components: [ConfirmationRow as any], // the typings are wrong here? annoying af
      embeds: [embed],
    });

    try {
      const response = await confirmationInteraction.awaitMessageComponent({
        filter: isSameUserFilter(interaction),
        time: SignupCommandHandler.SIGNUP_TIMEOUT,
      });

      await match(response)
        .with({ customId: 'confirm' }, async () => {
          await this.signupService.upsertSignup(signup);

          return interaction.editReply({
            content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CONFIRMED,
            ...CLEAR_EMBED,
          });
        })
        .with({ customId: 'cancel' }, () =>
          interaction.editReply({
            content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CANCELLED,
            ...CLEAR_EMBED,
          }),
        )
        .run();

      this.logger.log({ message: `signup ${response.customId}`, ...signup });
    } catch (e: unknown) {
      await this.handleError(e, interaction);
    }
  }

  private createSummaryEmbed({
    availability,
    character,
    encounter,
    fflogsLink,
    world,
  }: SignupRequest) {
    const embed = new EmbedBuilder()
      .setTitle(`${EncounterFriendlyDescription[encounter]} Signup`)
      .setDescription("Here's a summary of your selections")
      .addFields([
        { name: 'Character', value: character },
        { name: 'Home World', value: world },
        { name: 'FF Logs Link', value: fflogsLink },
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
          content: 'Sorry an unexpected error occurred',
          ...CLEAR_EMBED,
        });
      });
  }
}

export { SignupCommandHandler };
