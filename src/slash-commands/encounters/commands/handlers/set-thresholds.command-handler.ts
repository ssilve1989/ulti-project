import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  ActionRowBuilder,
  Colors,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} from 'discord.js';
import { isSameUserFilter } from '../../../../common/collection-filters.js';
import { EncountersService } from '../../../../encounters/encounters.service.js';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import { SetThresholdsCommand } from '../encounters.commands.js';

@CommandHandler(SetThresholdsCommand)
export class SetThresholdsCommandHandler
  implements ICommandHandler<SetThresholdsCommand>
{
  private readonly logger = new Logger(SetThresholdsCommandHandler.name);

  constructor(private readonly encountersService: EncountersService) {}

  @SentryTraced()
  async execute({
    interaction,
    encounterId,
  }: SetThresholdsCommand): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Get current encounter data
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

      if (progPoints.length === 0) {
        await interaction.editReply({
          content: `❌ No prog points found for encounter ${encounterId}.`,
        });
        return;
      }

      // Create embed showing current thresholds
      const embed = new EmbedBuilder()
        .setTitle(`Set Thresholds for ${encounter.name}`)
        .setColor(Colors.Blue)
        .setDescription('Select which threshold you want to set:')
        .addFields(
          {
            name: '📈 Current Prog Party Threshold',
            value: encounter.progPartyThreshold
              ? progPoints.find((p) => p.id === encounter.progPartyThreshold)
                  ?.label || 'Unknown'
              : 'Not set',
            inline: true,
          },
          {
            name: '🎯 Current Clear Party Threshold',
            value: encounter.clearPartyThreshold
              ? progPoints.find((p) => p.id === encounter.clearPartyThreshold)
                  ?.label || 'Unknown'
              : 'Not set',
            inline: true,
          },
        );

      // Create threshold selection menu
      const thresholdSelect = new StringSelectMenuBuilder()
        .setCustomId('select-threshold-type')
        .setPlaceholder('Choose threshold to set...')
        .addOptions([
          {
            label: 'Set Prog Party Threshold',
            value: 'prog',
            description: 'Set the point where parties become "Prog" status',
            emoji: '📈',
          },
          {
            label: 'Set Clear Party Threshold',
            value: 'clear',
            description: 'Set the point where parties become "Clear" status',
            emoji: '🎯',
          },
        ]);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        thresholdSelect,
      );

      const response = await interaction.editReply({
        embeds: [embed],
        components: [row],
      });

      // Handle threshold type selection
      const thresholdCollector = response.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: isSameUserFilter(interaction.user),
        time: 300_000, // 5 minutes
      });

      thresholdCollector.on('collect', async (thresholdInteraction) => {
        if (thresholdInteraction.customId !== 'select-threshold-type') return;

        await thresholdInteraction.deferUpdate();

        const thresholdType = thresholdInteraction.values[0] as
          | 'prog'
          | 'clear';
        const isProgThreshold = thresholdType === 'prog';

        // Filter prog points based on threshold type
        const eligibleProgPoints = isProgThreshold
          ? progPoints.filter(
              (p) => p.partyStatus !== PartyStatus.EarlyProgParty,
            )
          : progPoints.filter((p) => p.partyStatus === PartyStatus.ClearParty);

        if (eligibleProgPoints.length === 0) {
          await thresholdInteraction.editReply({
            content: `❌ No eligible prog points found for ${isProgThreshold ? 'prog' : 'clear'} threshold.`,
            components: [],
            embeds: [],
          });
          return;
        }

        // Create prog point selection menu
        const progPointSelect = new StringSelectMenuBuilder()
          .setCustomId(`select-prog-point-${thresholdType}`)
          .setPlaceholder(
            `Choose ${isProgThreshold ? 'prog' : 'clear'} threshold...`,
          )
          .addOptions(
            eligibleProgPoints.map((progPoint) => ({
              label: progPoint.label,
              value: progPoint.id,
              description: `Party Status: ${progPoint.partyStatus}`,
            })),
          );

        const progPointRow =
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            progPointSelect,
          );

        const updatedEmbed = EmbedBuilder.from(embed).setDescription(
          `Select the prog point for ${isProgThreshold ? 'prog' : 'clear'} party threshold:`,
        );

        await thresholdInteraction.editReply({
          embeds: [updatedEmbed],
          components: [progPointRow],
        });
      });

      // Handle prog point selection
      const progPointCollector = response.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: isSameUserFilter(interaction.user),
        time: 300_000, // 5 minutes
      });

      progPointCollector.on('collect', async (progPointInteraction) => {
        if (!progPointInteraction.customId.startsWith('select-prog-point-'))
          return;

        await progPointInteraction.deferUpdate();

        const thresholdType = progPointInteraction.customId.split('-')[3] as
          | 'prog'
          | 'clear';
        const progPointId = progPointInteraction.values[0];
        const selectedProgPoint = progPoints.find((p) => p.id === progPointId);

        if (!selectedProgPoint) {
          await progPointInteraction.editReply({
            content: '❌ Selected prog point not found.',
            components: [],
            embeds: [],
          });
          return;
        }

        try {
          // Update the threshold
          if (thresholdType === 'prog') {
            await this.encountersService.setProgPartyThreshold(
              encounterId,
              progPointId,
            );
          } else {
            await this.encountersService.setClearPartyThreshold(
              encounterId,
              progPointId,
            );
          }

          const successEmbed = new EmbedBuilder()
            .setTitle('✅ Threshold Updated')
            .setColor(Colors.Green)
            .setDescription(
              `Successfully set ${thresholdType === 'prog' ? 'prog' : 'clear'} party threshold to: **${selectedProgPoint.label}**`,
            );

          await progPointInteraction.editReply({
            embeds: [successEmbed],
            components: [],
          });

          this.logger.log(
            `User ${interaction.user.id} set ${thresholdType} threshold for ${encounterId} to ${progPointId}`,
          );
        } catch (error) {
          this.logger.error(error, 'Failed to update threshold');
          await progPointInteraction.editReply({
            content: '❌ Failed to update threshold. Please try again.',
            components: [],
            embeds: [],
          });
        }
      });

      // Handle timeout
      thresholdCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          interaction.editReply({
            content: '⏰ Threshold selection timed out.',
            components: [],
            embeds: [],
          });
        }
      });

      progPointCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          interaction.editReply({
            content: '⏰ Prog point selection timed out.',
            components: [],
            embeds: [],
          });
        }
      });
    } catch (error) {
      this.logger.error(error, 'Failed to handle set thresholds command');
      await interaction.editReply({
        content:
          '❌ An error occurred while setting thresholds. Please try again.',
      });
    }
  }
}
