import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import {
  EncounterFriendlyDescription,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { EncountersService } from '../../../encounters/encounters.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { SIGNUP_REVIEW_REACTIONS } from '../../signup/signup.consts.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { StatusService } from '../status.service.js';
import { StatusSlashCommand } from '../status.slash-command.js';

@Injectable()
@SlashCommand({ builder: StatusSlashCommand })
class StatusCommandHandler implements ISlashCommand {
  constructor(
    private readonly service: StatusService,
    private readonly errorService: ErrorService,
    private readonly encountersService: EncountersService,
  ) {}

  @SentryTraced()
  async execute(interaction: ChatInputCommandInteraction<'cached'>) {
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

      const embed = await this.createStatusEmbed(signups);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  private async createStatusEmbed(signups: SignupDocument[]) {
    const rows = await Promise.all(
      signups.map(async (signup) => ({
        signup,
        progPointLabel: await this.getProgPointLabel(signup),
      })),
    );

    const fields = rows.flatMap(
      ({ signup: { encounter, status, partyStatus }, progPointLabel }) => {
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

        if (progPointLabel) {
          subfields.push({
            name: 'Prog Point',
            value: progPointLabel,
            inline: false,
          });
        }

        return subfields;
      },
    );

    const embed = new EmbedBuilder().setTitle('Signup Summary');

    if (fields.length === 0) {
      return embed.setDescription(
        'You have no active signups. Use /signup to signup for an encounter.',
      );
    }
    return embed.addFields(fields);
  }

  private async getProgPointLabel({
    encounter,
    progPoint,
  }: SignupDocument): Promise<string | undefined> {
    if (!progPoint) return undefined;

    // includes inactive prog points, so a since-deactivated approval still resolves
    const progPoints = await this.encountersService.getAllProgPoints(encounter);
    const label = progPoints.find(({ id }) => id === progPoint)?.label;

    if (!label) {
      Sentry.getCurrentScope().captureMessage(
        `Approved prog point "${progPoint}" not found for encounter ${encounter}`,
        'warning',
      );
    }

    return label;
  }
}

export { StatusCommandHandler };
