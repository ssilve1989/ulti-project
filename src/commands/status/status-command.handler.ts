import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  APIEmbedField,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { EncounterFriendlyDescription } from '../../encounters/encounters.consts.js';
import {
  SignupDocument,
  SignupStatus,
} from '../../firebase/models/signup.model.js';
import { SIGNUP_REVIEW_REACTIONS } from '../signup/signup.consts.js';
import { StatusCommand } from './status.command.js';
import { StatusService } from './status.service.js';

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

  private createStatusEmbed(signups: SignupDocument[]) {
    const fields = signups.reduce((acc, { encounter, status, partyType }) => {
      const subfields = [
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
      ];

      if (partyType) {
        subfields.push({ value: partyType, name: 'Party Type', inline: true });
      }

      return acc.concat();
    }, [] as APIEmbedField[]);

    const embed = new EmbedBuilder().setTitle('Signup Summary');

    if (fields.length === 0) {
      return embed.setDescription(
        'You have no active signups. Use /signup to signup for an encounter.',
      );
    }
    return embed.addFields(fields);
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
