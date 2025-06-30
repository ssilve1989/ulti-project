import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import { Colors, EmbedBuilder } from 'discord.js';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../../../encounters/encounters.consts.js';
import { EncountersService } from '../../../../encounters/encounters.service.js';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import { ViewEncounterCommand } from '../encounters.commands.js';

@CommandHandler(ViewEncounterCommand)
export class ViewEncounterCommandHandler
  implements ICommandHandler<ViewEncounterCommand>
{
  private readonly logger = new Logger(ViewEncounterCommandHandler.name);

  constructor(private readonly encountersService: EncountersService) {}

  @SentryTraced()
  async execute({
    interaction,
    encounterId,
  }: ViewEncounterCommand): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      if (encounterId) {
        // Show specific encounter
        await this.showSingleEncounter(interaction, encounterId);
      } else {
        // Show all encounters
        await this.showAllEncounters(interaction);
      }
    } catch (error) {
      this.logger.error(error, 'Error viewing encounter data');
      await interaction.editReply({
        content:
          '❌ An error occurred while viewing encounter data. Please try again.',
      });
    }
  }

  private async showSingleEncounter(
    interaction: any,
    encounterId: string,
  ): Promise<void> {
    const [encounter, progPoints] = await Promise.all([
      this.encountersService.getEncounter(encounterId),
      this.encountersService.getProgPoints(encounterId),
    ]);

    if (!encounter) {
      await interaction.editReply({
        content: `❌ Encounter ${encounterId} not found.`,
      });
      return;
    }

    // Group prog points by party status
    const groupedProgPoints = progPoints.reduce(
      (acc, progPoint) => {
        if (!acc[progPoint.partyStatus]) {
          acc[progPoint.partyStatus] = [];
        }
        acc[progPoint.partyStatus].push(progPoint);
        return acc;
      },
      {} as Record<PartyStatus, typeof progPoints>,
    );

    // Find threshold prog points
    const progThresholdPoint = progPoints.find(
      (p) => p.id === encounter.progPartyThreshold,
    );
    const clearThresholdPoint = progPoints.find(
      (p) => p.id === encounter.clearPartyThreshold,
    );

    const embed = new EmbedBuilder()
      .setTitle(`${encounter.name} Configuration`)
      .setColor(Colors.Blue)
      .setDescription(`Total prog points: ${progPoints.length}`)
      .addFields(
        {
          name: '📈 Prog Party Threshold',
          value: progThresholdPoint
            ? `${progThresholdPoint.label} (${progThresholdPoint.id})`
            : 'Not set',
        },
        {
          name: '🎯 Clear Party Threshold',
          value: clearThresholdPoint
            ? `${clearThresholdPoint.label} (${clearThresholdPoint.id})`
            : 'Not set',
        },
      );

    // Add prog points by status
    for (const [status, points] of Object.entries(groupedProgPoints)) {
      if (points.length > 0) {
        const statusEmoji = this.getStatusEmoji(status as PartyStatus);
        const pointsList = points
          .map((p) => `• ${p.label} (${p.id})`)
          .join('\n');

        embed.addFields({
          name: `${statusEmoji} ${status} (${points.length})`,
          value:
            pointsList.length > 1024
              ? `${pointsList.substring(0, 1020)}...`
              : pointsList,
          inline: false,
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  }

  private async showAllEncounters(interaction: any): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('All Encounters Overview')
      .setColor(Colors.Blue)
      .setDescription('Configuration status for all encounters:');

    let hasData = false;

    for (const [key, encounterId] of Object.entries(Encounter)) {
      try {
        const [encounter, progPoints] = await Promise.all([
          this.encountersService.getEncounter(encounterId),
          this.encountersService.getProgPoints(encounterId),
        ]);

        if (encounter || progPoints.length > 0) {
          hasData = true;
          const status = encounter ? '✅ Configured' : '⚠️ Partial data';
          const description =
            encounter?.name ||
            EncounterFriendlyDescription[
              encounterId as keyof typeof EncounterFriendlyDescription
            ];

          embed.addFields({
            name: `${status} ${key}`,
            value: `${description}\nProg Points: ${progPoints.length}`,
            inline: true,
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to load data for encounter ${encounterId}:`,
          error,
        );
        embed.addFields({
          name: `❌ ${key}`,
          value: 'Error loading data',
          inline: true,
        });
      }
    }

    if (!hasData) {
      embed.setDescription(
        'No encounter data found. Run the migration script to populate data from constants.',
      );
    }

    await interaction.editReply({ embeds: [embed] });
  }

  private getStatusEmoji(status: PartyStatus): string {
    switch (status) {
      case PartyStatus.EarlyProgParty:
        return '🟡';
      case PartyStatus.ProgParty:
        return '🟠';
      case PartyStatus.ClearParty:
        return '🔴';
      case PartyStatus.Cleared:
        return '✅';
      default:
        return '⚪';
    }
  }
}
