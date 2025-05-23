import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { EncounterFriendlyDescription } from '../../encounters/encounters.consts.js';
import {
  type SignupDocument,
  SignupStatus,
} from '../../firebase/models/signup.model.js';
import { sentryReport } from '../../sentry/sentry.consts.js';
import { SIGNUP_REVIEW_REACTIONS } from '../signup/signup.consts.js';
import { StatusCommand } from './status.command.js';
import { StatusService } from './status.service.js';

@CommandHandler(StatusCommand)
class StatusCommandHandler implements ICommandHandler<StatusCommand> {
  private readonly logger = new Logger(StatusCommandHandler.name);

  constructor(private readonly service: StatusService) {}

  @SentryTraced()
  async execute({ interaction }: StatusCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const signups = await this.service.getSignups(interaction.user.id);
      const embed = this.createStatusEmbed(signups);

      await interaction.editReply({ embeds: [embed] });
    } catch (e: unknown) {
      await this.handleError(e, interaction);
    }
  }

  private createStatusEmbed(signups: SignupDocument[]) {
    const fields = signups.flatMap(({ encounter, status, partyStatus }) => {
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

      if (partyStatus) {
        subfields.push({
          value: partyStatus,
          name: 'Party Type',
          inline: true,
        });
      } else {
        subfields.push({ name: '\u200B', value: '\u200B', inline: true });
      }

      return subfields;
    });

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
    sentryReport(error);

    this.logger.error(error);

    return interaction.editReply({
      content: 'Sorry an unexpected error has occurred',
    });
  }
}

export { StatusCommandHandler };
