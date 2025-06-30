import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { isSameUserFilter } from '../../../../common/collection-filters.js';
import { EncountersService } from '../../../../encounters/encounters.service.js';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import { ManageProgPointsCommand } from '../encounters.commands.js';

@CommandHandler(ManageProgPointsCommand)
export class ManageProgPointsCommandHandler
  implements ICommandHandler<ManageProgPointsCommand>
{
  private readonly logger = new Logger(ManageProgPointsCommandHandler.name);

  constructor(private readonly encountersService: EncountersService) {}

  @SentryTraced()
  async execute({
    interaction,
    encounterId,
  }: ManageProgPointsCommand): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
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

      await this.showProgPointsManagement(interaction, encounter, progPoints);
    } catch (error) {
      this.logger.error(error, 'Failed to handle manage prog points command');
      await interaction.editReply({
        content:
          '❌ An error occurred while loading prog points. Please try again.',
      });
    }
  }

  private async showProgPointsManagement(
    interaction: any,
    encounter: any,
    progPoints: any[],
  ): Promise<void> {
    const encounterId =
      encounter.id || interaction.options?.getString('encounter');
    const embed = new EmbedBuilder()
      .setTitle(`Manage Prog Points - ${encounter.name}`)
      .setColor(Colors.Blue)
      .setDescription(`Current prog points: ${progPoints.length}`)
      .addFields({
        name: 'Actions Available',
        value:
          '• Add new prog point\n• Edit existing prog point\n• Remove prog point\n• Reorder prog points',
        inline: false,
      });

    // Add current prog points list
    if (progPoints.length > 0) {
      const progPointsList = progPoints
        .map((p, index) => `${index + 1}. **${p.label}** (${p.partyStatus})`)
        .join('\n');

      embed.addFields({
        name: 'Current Prog Points',
        value:
          progPointsList.length > 1024
            ? `${progPointsList.substring(0, 1020)}...`
            : progPointsList,
        inline: false,
      });
    }

    // Create action buttons (split into two rows due to Discord's 5 button limit per row)
    const actionButtons1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('add-prog-point')
        .setLabel('Add Prog Point')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➕'),
      new ButtonBuilder()
        .setCustomId('edit-prog-point')
        .setLabel('Edit Prog Point')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✏️')
        .setDisabled(progPoints.length === 0),
      new ButtonBuilder()
        .setCustomId('remove-prog-point')
        .setLabel('Remove Prog Point')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setDisabled(progPoints.length === 0),
    );

    const actionButtons2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('reorder-prog-points')
        .setLabel('Reorder Prog Points')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
        .setDisabled(progPoints.length < 2),
    );

    const response = await interaction.editReply({
      embeds: [embed],
      components: [actionButtons1, actionButtons2],
    });

    // Handle button interactions
    const collector = response.createMessageComponentCollector({
      filter: isSameUserFilter(interaction.user),
      time: 300_000, // 5 minutes
    });

    collector.on('collect', async (buttonInteraction: any) => {
      try {
        switch (buttonInteraction.customId) {
          case 'add-prog-point':
            await this.handleAddProgPoint(buttonInteraction, encounterId);
            break;
          case 'edit-prog-point':
            await this.handleEditProgPoint(
              buttonInteraction,
              encounterId,
              progPoints,
            );
            break;
          case 'remove-prog-point':
            await this.handleRemoveProgPoint(
              buttonInteraction,
              encounterId,
              progPoints,
            );
            break;
          case 'reorder-prog-points':
            await this.handleReorderProgPoints(
              buttonInteraction,
              encounterId,
              progPoints,
            );
            break;
        }
      } catch (error) {
        this.logger.error(error, 'Error handling prog point action');
        await buttonInteraction.followUp({
          content: '❌ An error occurred. Please try again.',
          ephemeral: true,
        });
      }
    });

    collector.on('end', (collected: any, reason: any) => {
      if (reason === 'time' && collected.size === 0) {
        interaction.editReply({
          content: '⏰ Prog point management timed out.',
          components: [],
          embeds: [],
        });
      }
    });
  }

  private async handleAddProgPoint(
    interaction: any,
    encounterId: string,
  ): Promise<void> {
    // Step 1: Show modal for label input
    const modal = new ModalBuilder()
      .setCustomId(`add-prog-point-modal-${encounterId}`)
      .setTitle('Add New Prog Point');

    const shortNameInput = new TextInputBuilder()
      .setCustomId('short-name')
      .setLabel('Short Name (ID for Google Sheets)')
      .setPlaceholder('e.g., P2-Strength, Limit-Cut, Enrage')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50);

    const longNameInput = new TextInputBuilder()
      .setCustomId('long-name')
      .setLabel('Long Name (Discord display)')
      .setPlaceholder('e.g., Phase 2: Strength of the Ward')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(shortNameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(longNameInput),
    );

    await interaction.showModal(modal);

    // Handle modal submission
    try {
      const modalSubmission = await interaction.awaitModalSubmit({
        time: 300_000,
        filter: (i: any) =>
          i.customId === `add-prog-point-modal-${encounterId}`,
      });

      await modalSubmission.deferReply({ ephemeral: true });

      const shortName = modalSubmission.fields.getTextInputValue('short-name');
      const longName = modalSubmission.fields.getTextInputValue('long-name');

      // Use short name as ID (after cleaning it)
      const progPointId = this.generateProgPointId(shortName);
      const existingProgPoints =
        await this.encountersService.getProgPoints(encounterId);
      if (existingProgPoints.some((p) => p.id === progPointId)) {
        await modalSubmission.editReply({
          content:
            '❌ A prog point with a similar short name already exists. Please use a different short name.',
        });
        return;
      }

      // Step 2: Show position selection for new prog point
      await this.showPositionSelect(
        modalSubmission,
        encounterId,
        progPointId,
        longName,
        existingProgPoints,
      );
    } catch (error) {
      this.logger.error(error, 'Failed to handle add prog point modal');
    }
  }

  private async showPositionSelect(
    interaction: any,
    encounterId: string,
    progPointId: string,
    longName: string,
    existingProgPoints: any[],
  ): Promise<void> {
    // Sort existing prog points by order
    const sortedProgPoints = [...existingProgPoints].sort(
      (a, b) => a.order - b.order,
    );

    // Create position options
    const positionOptions = [];

    // Add "At the beginning" option
    positionOptions.push({
      label: 'Position 1 (At the beginning)',
      value: '0',
      description:
        sortedProgPoints.length > 0
          ? `Before: ${sortedProgPoints[0]?.label}`
          : 'First prog point',
    });

    // Add positions between existing prog points
    for (let i = 0; i < sortedProgPoints.length; i++) {
      positionOptions.push({
        label: `Position ${i + 2}`,
        value: (i + 1).toString(),
        description:
          i < sortedProgPoints.length - 1
            ? `After: ${sortedProgPoints[i].label}, Before: ${sortedProgPoints[i + 1].label}`
            : `After: ${sortedProgPoints[i].label} (At the end)`,
      });
    }

    const positionSelect = new StringSelectMenuBuilder()
      .setCustomId(`select-position-${progPointId}`)
      .setPlaceholder('Choose position for the new prog point...')
      .addOptions(positionOptions);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      positionSelect,
    );

    const embed = new EmbedBuilder()
      .setTitle('Choose Position')
      .setColor(Colors.Blue)
      .addFields(
        { name: 'Short Name (ID)', value: progPointId, inline: true },
        { name: 'Long Name', value: longName, inline: true },
      )
      .setDescription('Select where to insert this prog point:');

    if (sortedProgPoints.length > 0) {
      embed.addFields({
        name: 'Current Order',
        value: sortedProgPoints
          .map((p, index) => `${index + 1}. ${p.label}`)
          .join('\n'),
        inline: false,
      });
    }

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Handle position selection
    const positionCollector =
      interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: (i: any) =>
          i.customId === `select-position-${progPointId}` &&
          i.user.id === interaction.user.id,
        time: 300_000,
      });

    positionCollector?.on('collect', async (positionInteraction: any) => {
      await positionInteraction.deferUpdate();

      const selectedPosition = Number.parseInt(positionInteraction.values[0]);

      // Step 3: Show party status select menu
      await this.showPartyStatusSelect(
        positionInteraction,
        encounterId,
        progPointId,
        longName,
        'add',
        undefined,
        selectedPosition,
      );
    });

    positionCollector?.on('end', (collected: any, reason: any) => {
      if (reason === 'time' && collected.size === 0) {
        interaction.editReply({
          content: '⏰ Position selection timed out.',
          embeds: [],
          components: [],
        });
      }
    });
  }

  private async showPartyStatusSelect(
    interaction: any,
    encounterId: string,
    progPointId: string,
    longName: string,
    action: 'add' | 'edit',
    currentStatus?: PartyStatus,
    insertPosition?: number,
  ): Promise<void> {
    const partyStatusSelect = new StringSelectMenuBuilder()
      .setCustomId(`party-status-select-${action}-${progPointId}`)
      .setPlaceholder('Choose party status...')
      .addOptions([
        {
          label: 'Early Prog Party',
          value: PartyStatus.EarlyProgParty,
          description: 'Players starting progression on this encounter',
          default: currentStatus === PartyStatus.EarlyProgParty,
        },
        {
          label: 'Prog Party',
          value: PartyStatus.ProgParty,
          description: 'Players actively progressing through phases',
          default: currentStatus === PartyStatus.ProgParty,
        },
        {
          label: 'Clear Party',
          value: PartyStatus.ClearParty,
          description: 'Players working on clearing the encounter',
          default: currentStatus === PartyStatus.ClearParty,
        },
        {
          label: 'Cleared',
          value: PartyStatus.Cleared,
          description: 'Players who have already cleared this encounter',
          default: currentStatus === PartyStatus.Cleared,
        },
      ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      partyStatusSelect,
    );

    const embed = new EmbedBuilder()
      .setTitle(`${action === 'add' ? 'Add' : 'Edit'} Prog Point`)
      .setColor(Colors.Blue)
      .addFields(
        { name: 'Short Name (ID)', value: progPointId, inline: true },
        { name: 'Long Name', value: longName, inline: true },
      )
      .setDescription('Select the party status for this prog point:');

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Handle party status selection
    const statusCollector =
      interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: (i: any) =>
          i.customId === `party-status-select-${action}-${progPointId}` &&
          i.user.id === interaction.user.id,
        time: 300_000,
      });

    statusCollector?.on('collect', async (statusInteraction: any) => {
      await statusInteraction.deferUpdate();

      const selectedStatus = statusInteraction.values[0] as PartyStatus;

      try {
        if (action === 'add') {
          if (insertPosition !== undefined) {
            // Add with specific position - need to reorder existing prog points
            const existingProgPoints =
              await this.encountersService.getProgPoints(encounterId);
            const sortedProgPoints = [...existingProgPoints].sort(
              (a, b) => a.order - b.order,
            );

            // Create new prog point with temporary order
            await this.encountersService.addProgPoint(encounterId, {
              id: progPointId,
              label: longName,
              partyStatus: selectedStatus,
            });

            // Create new order array with the new prog point inserted at the specified position
            const newProgPointIds = [...sortedProgPoints.map((p) => p.id)];
            newProgPointIds.splice(insertPosition, 0, progPointId);

            // Reorder all prog points
            await this.encountersService.reorderProgPoints(
              encounterId,
              newProgPointIds,
            );

            await statusInteraction.editReply({
              content: `✅ Successfully added prog point: **${longName}** (ID: ${progPointId}) at position ${insertPosition + 1} with status **${selectedStatus}**`,
              embeds: [],
              components: [],
            });
          } else {
            // Add at the end (default behavior)
            await this.encountersService.addProgPoint(encounterId, {
              id: progPointId,
              label: longName,
              partyStatus: selectedStatus,
            });

            await statusInteraction.editReply({
              content: `✅ Successfully added prog point: **${longName}** (ID: ${progPointId}) with status **${selectedStatus}**`,
              embeds: [],
              components: [],
            });
          }

          this.logger.log(
            `User ${interaction.user.id} added prog point ${progPointId} to encounter ${encounterId}`,
          );
        } else {
          // Handle edit case - need to handle potential ID changes
          const originalProgPointId = statusInteraction.customId
            .split('-')
            .pop();

          if (progPointId !== originalProgPointId) {
            // ID changed - need to replace the prog point while maintaining order
            const existingProgPoints =
              await this.encountersService.getProgPoints(encounterId);
            const originalProgPoint = existingProgPoints.find(
              (p) => p.id === originalProgPointId,
            );

            if (originalProgPoint) {
              const originalOrder = originalProgPoint.order;

              // Remove the old prog point
              await this.encountersService.removeProgPoint(
                encounterId,
                originalProgPointId,
              );

              // Add the new prog point (it will get added at the end)
              await this.encountersService.addProgPoint(encounterId, {
                id: progPointId,
                label: longName,
                partyStatus: selectedStatus,
              });

              // Reorder to put the new prog point in the correct position
              const updatedProgPoints =
                await this.encountersService.getProgPoints(encounterId);
              const sortedProgPoints = [...updatedProgPoints].sort(
                (a, b) => a.order - b.order,
              );

              // Find the new prog point and move it to the original position
              const newProgPointIndex = sortedProgPoints.findIndex(
                (p) => p.id === progPointId,
              );
              if (newProgPointIndex !== -1) {
                // Remove the new prog point from its current position
                const [movedProgPoint] = sortedProgPoints.splice(
                  newProgPointIndex,
                  1,
                );
                // Insert it at the original position
                sortedProgPoints.splice(originalOrder, 0, movedProgPoint);

                // Create new order array
                const newOrder = sortedProgPoints.map((p) => p.id);
                await this.encountersService.reorderProgPoints(
                  encounterId,
                  newOrder,
                );
              }
            }
          } else {
            // ID unchanged - simple update
            await this.encountersService.updateProgPoint(
              encounterId,
              progPointId,
              {
                label: longName,
                partyStatus: selectedStatus,
              },
            );
          }

          await statusInteraction.editReply({
            content: `✅ Successfully updated prog point: **${longName}** (ID: ${progPointId}) with status **${selectedStatus}**`,
            embeds: [],
            components: [],
          });

          this.logger.log(
            `User ${interaction.user.id} updated prog point ${progPointId} in encounter ${encounterId}`,
          );
        }
      } catch (error) {
        this.logger.error(error, `Failed to ${action} prog point`);
        await statusInteraction.editReply({
          content: `❌ Failed to ${action} prog point. Please try again.`,
          embeds: [],
          components: [],
        });
      }
    });

    statusCollector?.on('end', (collected: any, reason: any) => {
      if (reason === 'time' && collected.size === 0) {
        interaction.editReply({
          content: '⏰ Party status selection timed out.',
          embeds: [],
          components: [],
        });
      }
    });
  }

  private async handleEditProgPoint(
    interaction: any,
    encounterId: string,
    progPoints: any[],
  ): Promise<void> {
    await interaction.deferUpdate();

    // Create select menu for choosing prog point to edit
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-prog-point-edit')
      .setPlaceholder('Choose a prog point to edit...')
      .addOptions(
        progPoints.map((progPoint) => ({
          label: progPoint.label,
          value: progPoint.id,
          description: `Status: ${progPoint.partyStatus}`,
        })),
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu,
    );

    await interaction.editReply({
      content: 'Select a prog point to edit:',
      components: [row],
      embeds: [],
    });

    // Handle prog point selection
    const selectCollector = interaction.channel.createMessageComponentCollector(
      {
        componentType: ComponentType.StringSelect,
        filter: (i: any) =>
          i.customId === 'select-prog-point-edit' &&
          i.user.id === interaction.user.id,
        time: 60_000,
      },
    );

    selectCollector.on('collect', async (selectInteraction: any) => {
      const progPointId = selectInteraction.values[0];
      const progPoint = progPoints.find((p) => p.id === progPointId);

      if (!progPoint) {
        await selectInteraction.reply({
          content: '❌ Prog point not found.',
          ephemeral: true,
        });
        return;
      }

      // Step 1: Show modal for both short name and long name input (pre-filled with current values)
      const modal = new ModalBuilder()
        .setCustomId(`edit-prog-point-modal-${progPointId}`)
        .setTitle(`Edit: ${progPoint.label}`);

      const shortNameInput = new TextInputBuilder()
        .setCustomId('short-name')
        .setLabel('Short Name (ID for Google Sheets)')
        .setValue(progPoint.id)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

      const longNameInput = new TextInputBuilder()
        .setCustomId('long-name')
        .setLabel('Long Name (Discord display)')
        .setValue(progPoint.label)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(shortNameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(longNameInput),
      );

      await selectInteraction.showModal(modal);

      // Handle modal submission
      try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
          time: 300_000,
          filter: (i: any) =>
            i.customId === `edit-prog-point-modal-${progPointId}`,
        });

        await modalSubmission.deferReply({ ephemeral: true });

        const newShortName =
          modalSubmission.fields.getTextInputValue('short-name');
        const newLongName =
          modalSubmission.fields.getTextInputValue('long-name');

        // Generate new ID from short name (after cleaning it)
        const newProgPointId = this.generateProgPointId(newShortName);

        // Check if ID changed and if new ID already exists
        if (newProgPointId !== progPointId) {
          const existingProgPoints =
            await this.encountersService.getProgPoints(encounterId);
          if (existingProgPoints.some((p) => p.id === newProgPointId)) {
            await modalSubmission.editReply({
              content:
                '❌ A prog point with a similar short name already exists. Please use a different short name.',
            });
            return;
          }
        }

        // Step 2: Show party status select menu with current status selected
        await this.showPartyStatusSelect(
          modalSubmission,
          encounterId,
          newProgPointId,
          newLongName,
          'edit',
          progPoint.partyStatus as PartyStatus,
        );
      } catch (error) {
        this.logger.error(error, 'Failed to handle edit prog point modal');
      }
    });
  }

  private async handleRemoveProgPoint(
    interaction: any,
    encounterId: string,
    progPoints: any[],
  ): Promise<void> {
    await interaction.deferUpdate();

    // Create select menu for choosing prog point to remove
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-prog-point-remove')
      .setPlaceholder('Choose a prog point to remove...')
      .addOptions(
        progPoints.map((progPoint) => ({
          label: progPoint.label,
          value: progPoint.id,
          description: `Status: ${progPoint.partyStatus}`,
        })),
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu,
    );

    await interaction.editReply({
      content: '⚠️ Select a prog point to remove:',
      components: [row],
      embeds: [],
    });

    // Handle prog point selection
    const selectCollector = interaction.channel.createMessageComponentCollector(
      {
        componentType: ComponentType.StringSelect,
        filter: (i: any) =>
          i.customId === 'select-prog-point-remove' &&
          i.user.id === interaction.user.id,
        time: 60_000,
      },
    );

    selectCollector.on('collect', async (selectInteraction: any) => {
      const progPointId = selectInteraction.values[0];
      const progPoint = progPoints.find((p) => p.id === progPointId);

      if (!progPoint) {
        await selectInteraction.reply({
          content: '❌ Prog point not found.',
          ephemeral: true,
        });
        return;
      }

      await selectInteraction.deferUpdate();

      // Show confirmation
      const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Confirm Removal')
        .setColor(Colors.Orange)
        .setDescription('Are you sure you want to remove this prog point?')
        .addFields(
          { name: 'Label', value: progPoint.label, inline: true },
          { name: 'Party Status', value: progPoint.partyStatus, inline: true },
        );

      const confirmButtons =
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm-remove-${progPointId}`)
            .setLabel('Remove')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('cancel-remove')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
        );

      await selectInteraction.editReply({
        content: '',
        embeds: [confirmEmbed],
        components: [confirmButtons],
      });

      // Handle confirmation
      const confirmCollector =
        interaction.channel.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: (i: any) =>
            (i.customId === `confirm-remove-${progPointId}` ||
              i.customId === 'cancel-remove') &&
            i.user.id === interaction.user.id,
          time: 60_000,
        });

      confirmCollector.on('collect', async (confirmInteraction: any) => {
        await confirmInteraction.deferUpdate();

        if (confirmInteraction.customId === `confirm-remove-${progPointId}`) {
          try {
            await this.encountersService.removeProgPoint(
              encounterId,
              progPointId,
            );

            await confirmInteraction.editReply({
              content: `✅ Successfully removed prog point: **${progPoint.label}**`,
              embeds: [],
              components: [],
            });

            this.logger.log(
              `User ${interaction.user.id} removed prog point ${progPointId} from encounter ${encounterId}`,
            );
          } catch (error) {
            this.logger.error(error, 'Failed to remove prog point');
            await confirmInteraction.editReply({
              content: '❌ Failed to remove prog point. Please try again.',
              embeds: [],
              components: [],
            });
          }
        } else {
          await confirmInteraction.editReply({
            content: '✅ Removal cancelled.',
            embeds: [],
            components: [],
          });
        }
      });
    });
  }

  private async handleReorderProgPoints(
    interaction: any,
    encounterId: string,
    progPoints: any[],
  ): Promise<void> {
    await interaction.deferUpdate();

    // Sort prog points by current order
    const sortedProgPoints = [...progPoints].sort((a, b) => a.order - b.order);

    const embed = new EmbedBuilder()
      .setTitle('Reorder Prog Points')
      .setColor(Colors.Blue)
      .setDescription(
        'Select a prog point to move, then choose its new position:',
      )
      .addFields({
        name: 'Current Order',
        value: sortedProgPoints
          .map((p, index) => `${index + 1}. ${p.label}`)
          .join('\n'),
        inline: false,
      });

    // Create select menu for choosing prog point to move
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-prog-point-to-move')
      .setPlaceholder('Choose a prog point to move...')
      .addOptions(
        sortedProgPoints.map((progPoint, index) => ({
          label: `${index + 1}. ${progPoint.label}`,
          value: progPoint.id,
          description: `Current position: ${index + 1}`,
        })),
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu,
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Handle prog point selection for moving
    const selectCollector =
      interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: (i: any) =>
          i.customId === 'select-prog-point-to-move' &&
          i.user.id === interaction.user.id,
        time: 300_000,
      });

    selectCollector?.on('collect', async (selectInteraction: any) => {
      await selectInteraction.deferUpdate();

      const progPointToMove = selectInteraction.values[0];
      const movingProgPoint = sortedProgPoints.find(
        (p) => p.id === progPointToMove,
      );

      if (!movingProgPoint) {
        await selectInteraction.editReply({
          content: '❌ Prog point not found.',
          embeds: [],
          components: [],
        });
        return;
      }

      // Create position select menu
      const positionOptions = sortedProgPoints.map((_, index) => ({
        label: `Position ${index + 1}`,
        value: index.toString(),
        description:
          index < sortedProgPoints.length - 1
            ? `Before: ${sortedProgPoints[index + 1]?.label || 'End'}`
            : 'At the end',
      }));

      const positionSelect = new StringSelectMenuBuilder()
        .setCustomId(`select-new-position-${progPointToMove}`)
        .setPlaceholder('Choose new position...')
        .addOptions(positionOptions);

      const positionRow =
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          positionSelect,
        );

      const positionEmbed = new EmbedBuilder()
        .setTitle('Choose New Position')
        .setColor(Colors.Blue)
        .setDescription(
          `Moving: **${movingProgPoint.label}**\n\nSelect the new position:`,
        )
        .addFields({
          name: 'Current Order',
          value: sortedProgPoints
            .map((p, index) => {
              const prefix =
                p.id === progPointToMove ? '**→ ' : `${index + 1}. `;
              const suffix = p.id === progPointToMove ? '**' : '';
              return `${prefix}${p.label}${suffix}`;
            })
            .join('\n'),
          inline: false,
        });

      await selectInteraction.editReply({
        embeds: [positionEmbed],
        components: [positionRow],
      });

      // Handle position selection
      const positionCollector =
        interaction.channel?.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          filter: (i: any) =>
            i.customId === `select-new-position-${progPointToMove}` &&
            i.user.id === interaction.user.id,
          time: 300_000,
        });

      positionCollector?.on('collect', async (positionInteraction: any) => {
        await positionInteraction.deferUpdate();

        const newPosition = Number.parseInt(positionInteraction.values[0]);
        const currentPosition = sortedProgPoints.findIndex(
          (p) => p.id === progPointToMove,
        );

        if (newPosition === currentPosition) {
          await positionInteraction.editReply({
            content:
              '✅ No changes made - prog point is already in that position.',
            embeds: [],
            components: [],
          });
          return;
        }

        try {
          // Create new order by moving the prog point
          const reorderedProgPoints = [...sortedProgPoints];
          const [movedItem] = reorderedProgPoints.splice(currentPosition, 1);
          reorderedProgPoints.splice(newPosition, 0, movedItem);

          // Create the new order array with prog point IDs
          const newOrder = reorderedProgPoints.map((p) => p.id);

          await this.encountersService.reorderProgPoints(encounterId, newOrder);

          const successEmbed = new EmbedBuilder()
            .setTitle('✅ Prog Points Reordered')
            .setColor(Colors.Green)
            .setDescription(
              `Successfully moved **${movingProgPoint.label}** to position ${newPosition + 1}`,
            )
            .addFields({
              name: 'New Order',
              value: reorderedProgPoints
                .map((p, index) => {
                  const isRelocated = p.id === progPointToMove;
                  return isRelocated
                    ? `**${index + 1}. ${p.label}** ← Moved here`
                    : `${index + 1}. ${p.label}`;
                })
                .join('\n'),
              inline: false,
            });

          await positionInteraction.editReply({
            embeds: [successEmbed],
            components: [],
          });

          this.logger.log(
            `User ${interaction.user.id} reordered prog points in encounter ${encounterId}`,
          );
        } catch (error) {
          this.logger.error(error, 'Failed to reorder prog points');
          await positionInteraction.editReply({
            content: '❌ Failed to reorder prog points. Please try again.',
            embeds: [],
            components: [],
          });
        }
      });

      positionCollector?.on('end', (collected: any, reason: any) => {
        if (reason === 'time' && collected.size === 0) {
          interaction.editReply({
            content: '⏰ Position selection timed out.',
            embeds: [],
            components: [],
          });
        }
      });
    });

    selectCollector?.on('end', (collected: any, reason: any) => {
      if (reason === 'time' && collected.size === 0) {
        interaction.editReply({
          content: '⏰ Prog point selection timed out.',
          embeds: [],
          components: [],
        });
      }
    });
  }

  private generateProgPointId(label: string): string {
    // Convert label to a clean ID
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with dashes
      .replace(/-+/g, '-') // Replace multiple dashes with single dash
      .replace(/^-|-$/g, ''); // Remove leading/trailing dashes
  }
}
