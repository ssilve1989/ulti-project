import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { EncounterFriendlyDescription } from '../../../encounters/encounters.consts.js';
import { ErrorService } from '../../../error/error.service.js';
import {
  type SignupDocument,
  SignupStatus,
} from '../../../firebase/models/signup.model.js';
import { SIGNUP_REVIEW_REACTIONS } from '../../signup/signup.consts.js';
import { StatusCommand } from '../commands/status.command.js';
import { StatusService } from '../status.service.js';

@CommandHandler(StatusCommand)
class StatusCommandHandler implements ICommandHandler<StatusCommand> {
  constructor(
    private readonly service: StatusService,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: StatusCommand) {
    const scope = Sentry.getCurrentScope();
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const signups = await this.service.getSignups(interaction.user.id);

      // Add context about the results
      scope.setContext('status_results', {
        signupCount: signups.length,
        hasSignups: signups.length > 0,
        encounters: signups.map((s) => s.encounter),
      });

      const embed = this.createStatusEmbed(signups);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  private createStatusEmbed(signups: SignupDocument[]) {
    const fields = signups.flatMap((signup) => {
      const subfields = [
        {
          name: 'Encounter',
          value: EncounterFriendlyDescription[signup.encounter],
          inline: true,
        },
        {
          name: 'Status',
          value: `${SIGNUP_REVIEW_REACTIONS[signup.status]} ${SignupStatus[signup.status]}`,
          inline: true,
        },
      ];

      if (signup.status === SignupStatus.APPROVED && signup.partyStatus) {
        subfields.push({
          value: signup.partyStatus,
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
}

export { StatusCommandHandler };
