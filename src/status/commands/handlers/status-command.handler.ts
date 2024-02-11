import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  APIEmbedField,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { EncounterFriendlyDescription } from '../../../encounters/encounters.consts.js';
import {
  SIGNUP_REVIEW_REACTIONS,
  SignupStatus,
} from '../../../signups/signup.consts.js';
import { Signup } from '../../../signups/signup.interfaces.js';
import { StatusCommand } from '../status.command.js';
import { StatusService } from '../../status.service.js';

@CommandHandler(StatusCommand)
class StatusCommandHandler implements ICommandHandler<StatusCommand> {
  private readonly logger = new Logger(StatusCommandHandler.name);

  constructor(private readonly service: StatusService) {}

  async execute({ interaction }: StatusCommand) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const signups = await this.service.getSignups(interaction.user.id);
      const embed = this.createStatusEmbed(signups);

      await interaction.editReply({ embeds: [embed] });
    } catch (e: unknown) {
      await this.handleError(e, interaction);
    }
  }

  private createStatusEmbed(signups: Signup[]) {
    const fields = signups.reduce((acc, { encounter, status, partyType }) => {
      return acc.concat([
        {
          name: 'Encounter',
          value: EncounterFriendlyDescription[encounter],
          inline: true,
        },
        {
          name: 'Status',
          value: `${SIGNUP_REVIEW_REACTIONS[status]} ${SignupStatus[status]}`,
          inline: true,
        },
        { name: 'Party Type', value: partyType, inline: true },
      ]);
    }, [] as APIEmbedField[]);

    const embed = new EmbedBuilder().setTitle('Signup Summary');

    if (fields.length === 0) {
      return embed.setDescription(
        'You have no active signups. Use /signup to signup for an encounter.',
      );
    } else {
      return embed.addFields(fields);
    }
  }

  private handleError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
  ) {
    this.logger.error(error);

    return interaction.editReply({
      content: 'Sorry an unexpected error has occurred',
    });
  }
}

export { StatusCommandHandler };
