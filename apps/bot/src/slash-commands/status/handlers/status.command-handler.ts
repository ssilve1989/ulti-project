import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { type SignupDocument, SignupStatus } from '@ulti-project/shared';
import type { APIEmbedField, ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { emptyField, encounterField } from '#src/common/components/fields.js';
import { EncountersService } from '#src/encounters/encounters.service.js';
import { SIGNUP_REVIEW_REACTIONS } from '#src/slash-commands/signup/signup.consts.js';
import { SlashCommand } from '#src/slash-commands/slash-command.decorator.js';
import type { ISlashCommand } from '#src/slash-commands/slash-command.interface.js';
import { StatusService } from '#src/slash-commands/status/status.service.js';
import { StatusSlashCommand } from '#src/slash-commands/status/status.slash-command.js';

@Injectable()
@SlashCommand({ builder: StatusSlashCommand })
class StatusCommandHandler implements ISlashCommand {
  constructor(
    private readonly service: StatusService,
    private readonly encountersService: EncountersService,
  ) {}

  async execute(interaction: ChatInputCommandInteraction<'cached'>) {
    const scope = Sentry.getCurrentScope();
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
        const subfields: APIEmbedField[] = [
          encounterField(encounter),
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
          subfields.push(emptyField());
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
