import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Colors, EmbedBuilder, MessageFlags } from 'discord.js';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../../encounters/encounters.consts.js';
import { EncountersService } from '../../../encounters/encounters.service.js';
import { PartyStatus } from '../../../firebase/models/signup.model.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { EncountersSlashCommand } from '../encounters.slash-command.js';

@Injectable()
@SlashCommand({ builder: EncountersSlashCommand, subcommand: 'view' })
export class ViewEncounterCommandHandler implements ISlashCommand {
  private readonly logger = new Logger(ViewEncounterCommandHandler.name);

  constructor(private readonly encountersService: EncountersService) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const encounterId = interaction.options.getString('encounter');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (encounterId) {
        await this.showSingleEncounter(interaction, encounterId);
      } else {
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
    interaction: ChatInputCommandInteraction,
    encounterId: string,
  ): Promise<void> {
    const [encounter, progPoints] = await Promise.all([
      this.encountersService.getEncounter(encounterId),
      this.encountersService.getAllProgPoints(encounterId),
    ]);

    if (!encounter) {
      await interaction.editReply({
        content: `❌ Encounter ${encounterId} not found.`,
      });
      return;
    }

    const sortedProgPoints = [...progPoints].sort((a, b) => a.order - b.order);

    const groupedProgPoints = sortedProgPoints.reduce(
      (acc, progPoint) => {
        if (!acc[progPoint.partyStatus]) {
          acc[progPoint.partyStatus] = [];
        }
        acc[progPoint.partyStatus].push(progPoint);
        return acc;
      },
      {} as Record<PartyStatus, typeof progPoints>,
    );

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

    for (const [status, points] of Object.entries(groupedProgPoints)) {
      if (points.length > 0) {
        const statusEmoji = this.getStatusEmoji(status as PartyStatus);
        const pointsList = points
          .map((p) => {
            const activeIcon = p.active ? '✅' : '❌';
            return `• ${activeIcon} ${p.label} (${p.id})`;
          })
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

  private async showAllEncounters(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('All Encounters Overview')
      .setColor(Colors.Blue)
      .setDescription('Configuration status for all encounters:');

    const encounterPromises = Object.entries(Encounter).map(
      async ([key, encounterId]) => {
        try {
          const [encounter, progPoints] = await Promise.all([
            this.encountersService.getEncounter(encounterId),
            this.encountersService.getAllProgPoints(encounterId),
          ]);

          return {
            key,
            encounterId,
            encounter,
            progPoints,
            error: null,
          };
        } catch (error) {
          this.logger.warn(
            `Failed to load data for encounter ${encounterId}:`,
            error,
          );
          return {
            key,
            encounterId,
            encounter: null,
            progPoints: [],
            error,
          };
        }
      },
    );

    const encounterResults = await Promise.all(encounterPromises);

    let hasData = false;

    for (const { key, encounter, progPoints, error } of encounterResults) {
      if (error) {
        embed.addFields({
          name: `❌ ${key}`,
          value: 'Error loading data',
          inline: true,
        });
      } else if (encounter || progPoints.length > 0) {
        hasData = true;
        const status = encounter ? '✅ Configured' : '⚠️ Partial data';
        const description =
          encounter?.name ||
          EncounterFriendlyDescription[
            encounter?.id as keyof typeof EncounterFriendlyDescription
          ];

        embed.addFields({
          name: `${status} ${key}`,
          value: `${description}\nProg Points: ${progPoints.length}`,
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
