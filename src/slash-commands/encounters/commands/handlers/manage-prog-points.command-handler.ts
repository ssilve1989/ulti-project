import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  Colors,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { isSameUserFilter } from '../../../../common/collection-filters.js';
import { EncountersService } from '../../../../encounters/encounters.service.js';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '../../../../firebase/models/encounter.model.js';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import { ManageProgPointsCommand } from '../encounters.commands.js';

/**
 * This handler was made by several different AI Models and could use some TLC.
 */
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    encounter: EncounterDocument,
    progPoints: ProgPointDocument[],
  ): Promise<void> {
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

    collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
      try {
        switch (buttonInteraction.customId) {
          case 'add-prog-point':
            await this.handleAddProgPoint(buttonInteraction, encounter);
            break;
          case 'edit-prog-point':
            await this.handleEditProgPoint(
              buttonInteraction,
              encounter,
              progPoints,
            );
            break;
          case 'remove-prog-point':
            await this.handleRemoveProgPoint(
              buttonInteraction,
              encounter,
              progPoints,
            );
            break;
          case 'reorder-prog-points':
            await this.handleReorderProgPoints(
              buttonInteraction,
              encounter,
              progPoints,
            );
            break;
        }
      } catch (error) {
        this.logger.error(error, 'Error handling prog point action');
        await buttonInteraction.followUp({
          content: '❌ An error occurred. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      }
    });

    collector.on('end', (collected, reason) => {
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
    interaction: ButtonInteraction,
    encounter: EncounterDocument,
  ): Promise<void> {
    // Step 1: Show modal for label input
    const modal = new ModalBuilder()
      .setCustomId(`add-prog-point-modal-${encounter.id}`)
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
        filter: (i: ModalSubmitInteraction) =>
          i.customId === `add-prog-point-modal-${encounter.id}`,
      });

      await modalSubmission.deferReply({ flags: MessageFlags.Ephemeral });

      const shortName = modalSubmission.fields.getTextInputValue('short-name');
      const longName = modalSubmission.fields.getTextInputValue('long-name');

      // Use short name as ID (after cleaning it)
      const progPointId = this.generateProgPointId(shortName);
      const existingProgPoints = await this.encountersService.getProgPoints(
        encounter.id,
      );
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
        encounter,
        progPointId,
        longName,
        existingProgPoints,
      );
    } catch (error) {
      this.logger.error(error, 'Failed to handle add prog point modal');
    }
  }

  private async showPositionSelect(
    interaction: ModalSubmitInteraction,
    encounter: EncounterDocument,
    progPointId: string,
    longName: string,
    existingProgPoints: ProgPointDocument[],
  ): Promise<void> {
    // Sort existing prog points by order
    const sortedProgPoints = [...existingProgPoints].sort(
      (a, b) => a.order - b.order,
    );

    const positionOptions = sortedProgPoints.map((p, index) => ({
      label: `Position ${index + 2}`,
      value: (index + 1).toString(),
      description:
        index < sortedProgPoints.length - 1
          ? `After: ${p.label}, Before: ${sortedProgPoints[index + 1].label}`
          : `After: ${p.label} (At the end)`,
    }));

    positionOptions.unshift({
      label: 'Position 1 (At the beginning)',
      value: '0',
      description:
        sortedProgPoints.length > 0
          ? `Before: ${sortedProgPoints[0]?.label}`
          : 'First prog point',
    });

    const positionSelect = new StringSelectMenuBuilder()
      .setCustomId(`select-position-${progPointId}`)
      .setPlaceholder('Choose position for the new prog point...')
      .addOptions(positionOptions);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      positionSelect,
    );

    // Add back button for navigation
    const backButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`back-to-main-position-${encounter.id}`)
        .setLabel('Back to Main Menu')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔙'),
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
      components: [row, backButton],
    });

    // Handle position selection
    const positionCollector =
      interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: (i: StringSelectMenuInteraction) =>
          i.customId === `select-position-${progPointId}` &&
          i.user.id === interaction.user.id,
        time: 300_000,
      });

    // Handle back button for position selection
    const positionBackCollector =
      interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i: ButtonInteraction) =>
          i.customId === `back-to-main-position-${encounter.id}` &&
          i.user.id === interaction.user.id,
        time: 300_000,
      });

    if (!positionBackCollector) return;

    positionBackCollector.on(
      'collect',
      async (backInteraction: ButtonInteraction) => {
        await backInteraction.deferUpdate();
        const progPoints = await this.encountersService.getProgPoints(
          encounter.id,
        );
        await this.showProgPointsManagement(
          backInteraction,
          encounter,
          progPoints,
        );
        positionCollector?.stop();
        positionBackCollector.stop();
      },
    );

    if (!positionCollector) return;

    positionCollector.on(
      'collect',
      async (positionInteraction: StringSelectMenuInteraction) => {
        await positionInteraction.deferUpdate();
        positionBackCollector.stop(); // Stop back collector when user makes a selection

        const selectedPosition = Number.parseInt(positionInteraction.values[0]);

        // Step 3: Show party status select menu
        await this.showPartyStatusSelect(
          positionInteraction,
          encounter,
          progPointId,
          longName,
          'add',
          selectedPosition,
        );
      },
    );

    positionCollector.on('end', (collected, reason) => {
      positionBackCollector.stop();
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
    interaction: StringSelectMenuInteraction | ModalSubmitInteraction,
    encounter: EncounterDocument,
    progPointId: string,
    longName: string,
    action: 'add' | 'edit',
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
        },
        {
          label: 'Prog Party',
          value: PartyStatus.ProgParty,
          description: 'Players actively progressing through phases',
        },
        {
          label: 'Clear Party',
          value: PartyStatus.ClearParty,
          description: 'Players working on clearing the encounter',
        },
        {
          label: 'Cleared',
          value: PartyStatus.Cleared,
          description: 'Players who have already cleared this encounter',
        },
      ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      partyStatusSelect,
    );

    // Add back button for navigation
    const backButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`back-to-main-${encounter.id}`)
        .setLabel('Back to Main Menu')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔙'),
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
      components: [row, backButton],
    });

    // Handle party status selection
    const statusCollector =
      interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: (i) =>
          i.customId === `party-status-select-${action}-${progPointId}` &&
          i.user.id === interaction.user.id,
        time: 300_000,
      });

    // Handle back button interaction
    const backCollector = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) =>
        i.customId === `back-to-main-${encounter.id}` &&
        i.user.id === interaction.user.id,
      time: 300_000,
    });

    if (!backCollector) return;

    backCollector.on('collect', async (backInteraction) => {
      await backInteraction.deferUpdate();
      const progPoints = await this.encountersService.getProgPoints(
        encounter.id,
      );
      await this.showProgPointsManagement(
        backInteraction,
        encounter,
        progPoints,
      );
      statusCollector?.stop();
      backCollector.stop();
    });

    if (!statusCollector) return;

    statusCollector.on('collect', async (statusInteraction) => {
      await statusInteraction.deferUpdate();
      backCollector.stop(); // Stop back collector when user makes a selection

      const selectedStatus = statusInteraction.values[0] as PartyStatus;

      try {
        if (action === 'add') {
          if (insertPosition !== undefined) {
            // Add with specific position - need to reorder existing prog points
            const existingProgPoints =
              await this.encountersService.getProgPoints(encounter.id);
            const sortedProgPoints = [...existingProgPoints].sort(
              (a, b) => a.order - b.order,
            );

            // Create new prog point with temporary order
            await this.encountersService.addProgPoint(encounter.id, {
              id: progPointId,
              label: longName,
              partyStatus: selectedStatus,
            });

            // Create new order array with the new prog point inserted at the specified position
            const newProgPointIds = [...sortedProgPoints.map((p) => p.id)];
            newProgPointIds.splice(insertPosition, 0, progPointId);

            // Reorder all prog points
            await this.encountersService.reorderProgPoints(
              encounter.id,
              newProgPointIds,
            );

            await this.showSuccessWithReturnOption(
              statusInteraction,
              `✅ Successfully added prog point: **${longName}** (ID: ${progPointId}) at position ${insertPosition + 1} with status **${selectedStatus}**`,
              encounter,
              interaction.user.id,
            );
          } else {
            // Add at the end (default behavior)
            await this.encountersService.addProgPoint(encounter.id, {
              id: progPointId,
              label: longName,
              partyStatus: selectedStatus,
            });

            await this.showSuccessWithReturnOption(
              statusInteraction,
              `✅ Successfully added prog point: **${longName}** (ID: ${progPointId}) with status **${selectedStatus}**`,
              encounter,
              interaction.user.id,
            );
          }

          this.logger.log(
            `User ${interaction.user.id} added prog point ${progPointId} to encounter ${encounter.id}`,
          );
        } else {
          // Handle edit case - ID is always unchanged now, so simple update
          await this.encountersService.updateProgPoint(
            encounter.id,
            progPointId,
            {
              label: longName,
              partyStatus: selectedStatus,
            },
          );

          await this.showSuccessWithReturnOption(
            statusInteraction,
            `✅ Successfully updated prog point: **${longName}** (ID: ${progPointId}) with status **${selectedStatus}**`,
            encounter,
            interaction.user.id,
          );

          this.logger.log(
            `User ${interaction.user.id} updated prog point ${progPointId} in encounter ${encounter.id}`,
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

    statusCollector.on('end', (collected, reason) => {
      backCollector.stop();
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
    interaction: ButtonInteraction,
    encounter: EncounterDocument,
    progPoints: ProgPointDocument[],
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

    // Add back to main menu button
    const backButton = new ButtonBuilder()
      .setCustomId('back-to-main')
      .setLabel('Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const selectRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      backButton,
    );

    await interaction.editReply({
      content: 'Select a prog point to edit:',
      components: [selectRow, buttonRow],
      embeds: [],
    });

    // Handle both select menu and back button
    const collector = interaction.channel?.createMessageComponentCollector({
      filter: (i) =>
        (i.customId === 'select-prog-point-edit' ||
          i.customId === 'back-to-main') &&
        i.user.id === interaction.user.id,
      time: 60_000,
    });

    if (!collector) return;

    collector.on('collect', async (componentInteraction) => {
      if (componentInteraction.customId === 'back-to-main') {
        collector.stop();
        const updatedProgPoints = await this.encountersService.getProgPoints(
          encounter.id,
        );
        await this.showProgPointsManagement(
          componentInteraction as ButtonInteraction,
          encounter,
          updatedProgPoints,
        );
        return;
      }

      const progPointId = (componentInteraction as StringSelectMenuInteraction)
        .values[0];

      const progPoint = progPoints.find((p) => p.id === progPointId);

      if (!progPoint) {
        await componentInteraction.reply({
          content: '❌ Prog point not found.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Step 1: Show modal for long name input only (short name/ID cannot be changed)
      const modal = new ModalBuilder()
        .setCustomId(`edit-prog-point-modal-${progPointId}`)
        .setTitle(`Edit Prog Point: ${progPoint.id}`);

      const longNameInput = new TextInputBuilder()
        .setCustomId('long-name')
        .setLabel('Long Name (Discord display)')
        .setPlaceholder('e.g., Phase 2: Strength of the Ward')
        .setValue(progPoint.label)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(longNameInput),
      );

      await componentInteraction.showModal(modal);

      // Handle modal submission with proper timeout handling
      try {
        const modalSubmission = await componentInteraction.awaitModalSubmit({
          time: 300_000,
          filter: (i) => i.customId === `edit-prog-point-modal-${progPointId}`,
        });

        collector.stop(); // Stop the collector since we're proceeding

        await modalSubmission.deferReply({ flags: MessageFlags.Ephemeral });

        const newLongName =
          modalSubmission.fields.getTextInputValue('long-name');

        // Step 2: Show party status select menu with current status selected
        await this.showPartyStatusSelect(
          modalSubmission,
          encounter,
          progPointId, // Keep the original ID - no changes allowed
          newLongName,
          'edit',
        );
      } catch (_error) {
        // Modal was cancelled or timed out - don't stop the collector
        // User can try again with the same prog point
        this.logger.debug('Modal cancelled or timed out, user can try again');
      }
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        interaction
          .editReply({
            content: '⏰ Selection timed out.',
            components: [],
          })
          .catch(() => {}); // Ignore errors if interaction is already handled
      }
    });
  }

  private async handleRemoveProgPoint(
    interaction: ButtonInteraction,
    encounter: EncounterDocument,
    progPoints: ProgPointDocument[],
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

    // Add back to main menu button
    const backButton = new ButtonBuilder()
      .setCustomId('back-to-main-remove')
      .setLabel('Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const selectRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      backButton,
    );

    await interaction.editReply({
      content: '⚠️ Select a prog point to remove:',
      components: [selectRow, buttonRow],
      embeds: [],
    });

    // Handle both select menu and back button
    const collector = interaction.channel?.createMessageComponentCollector({
      filter: (i) =>
        (i.customId === 'select-prog-point-remove' ||
          i.customId === 'back-to-main-remove') &&
        i.user.id === interaction.user.id,
      time: 60_000,
    });

    if (!collector) return;

    collector.on('collect', async (componentInteraction) => {
      if (componentInteraction.customId === 'back-to-main-remove') {
        collector.stop();
        const updatedProgPoints = await this.encountersService.getProgPoints(
          encounter.id,
        );

        await this.showProgPointsManagement(
          componentInteraction as ButtonInteraction,
          encounter,
          updatedProgPoints,
        );

        return;
      }

      const progPointId = (componentInteraction as StringSelectMenuInteraction)
        .values[0];

      const progPoint = progPoints.find((p) => p.id === progPointId);

      if (!progPoint) {
        await componentInteraction.reply({
          content: '❌ Prog point not found.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await componentInteraction.deferUpdate();
      collector.stop(); // Stop the collector since we're proceeding

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
          new ButtonBuilder()
            .setCustomId('back-to-main-from-remove')
            .setLabel('Back to Main Menu')
            .setStyle(ButtonStyle.Secondary),
        );

      await componentInteraction.editReply({
        content: '',
        embeds: [confirmEmbed],
        components: [confirmButtons],
      });

      // Handle confirmation
      const confirmCollector =
        interaction.channel?.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: (i) =>
            (i.customId === `confirm-remove-${progPointId}` ||
              i.customId === 'cancel-remove' ||
              i.customId === 'back-to-main-from-remove') &&
            i.user.id === interaction.user.id,
          time: 60_000,
        });

      if (!confirmCollector) return;

      confirmCollector.on('collect', async (confirmInteraction) => {
        await confirmInteraction.deferUpdate();

        if (confirmInteraction.customId === 'back-to-main-from-remove') {
          const updatedProgPoints = await this.encountersService.getProgPoints(
            encounter.id,
          );

          await this.showProgPointsManagement(
            confirmInteraction,
            encounter,
            updatedProgPoints,
          );
          return;
        }

        if (confirmInteraction.customId === `confirm-remove-${progPointId}`) {
          try {
            await this.encountersService.removeProgPoint(
              encounter.id,
              progPointId,
            );

            await this.showSuccessWithReturnOption(
              confirmInteraction,
              `✅ Successfully removed prog point: **${progPoint.label}**`,
              encounter,
              interaction.user.id,
            );

            this.logger.log(
              `User ${interaction.user.id} removed prog point ${progPointId} from encounter ${encounter.id}`,
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

    collector.on('end', (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        interaction
          .editReply({
            content: '⏰ Selection timed out.',
            components: [],
          })
          .catch(() => {}); // Ignore errors if interaction is already handled
      }
    });
  }

  private async handleReorderProgPoints(
    interaction: ButtonInteraction,
    encounter: EncounterDocument,
    progPoints: ProgPointDocument[],
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
        filter: (i) =>
          i.customId === 'select-prog-point-to-move' &&
          i.user.id === interaction.user.id,
        time: 300_000,
      });

    if (!selectCollector) return;

    selectCollector.on('collect', async (selectInteraction) => {
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
          filter: (i) =>
            i.customId === `select-new-position-${progPointToMove}` &&
            i.user.id === interaction.user.id,
          time: 300_000,
        });

      if (!positionCollector) return;

      positionCollector.on('collect', async (positionInteraction) => {
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

          await this.encountersService.reorderProgPoints(
            encounter.id,
            newOrder,
          );

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

          const returnButton =
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`return-to-main-reorder-${encounter.id}`)
                .setLabel('Back to Main Menu')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔙'),
            );

          await positionInteraction.editReply({
            embeds: [successEmbed],
            components: [returnButton],
          });

          // Handle return button interaction
          const returnCollector =
            positionInteraction.channel?.createMessageComponentCollector({
              componentType: ComponentType.Button,
              filter: (i) =>
                i.customId === `return-to-main-reorder-${encounter.id}` &&
                i.user.id === interaction.user.id,
              time: 60_000,
            });

          if (!returnCollector) return;

          returnCollector.on('collect', async (returnInteraction) => {
            await returnInteraction.deferUpdate();
            await this.showMainEncounterView(returnInteraction, encounter);
          });

          returnCollector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
              positionInteraction.editReply({
                embeds: [successEmbed],
                components: [],
              });
            }
          });

          this.logger.log(
            `User ${interaction.user.id} reordered prog points in encounter ${encounter.id}`,
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

      positionCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          interaction.editReply({
            content: '⏰ Position selection timed out.',
            embeds: [],
            components: [],
          });
        }
      });
    });

    selectCollector.on('end', (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        interaction.editReply({
          content: '⏰ Prog point selection timed out.',
          embeds: [],
          components: [],
        });
      }
    });
  }

  private async showSuccessWithReturnOption(
    interaction: StringSelectMenuInteraction | ButtonInteraction,
    successMessage: string,
    encounter: EncounterDocument,
    userId: string,
  ): Promise<void> {
    const returnButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`return-to-main-${encounter.id}`)
        .setLabel('Back to Main Menu')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔙'),
    );

    await interaction.editReply({
      content: successMessage,
      embeds: [],
      components: [returnButton],
    });

    // Handle return button interaction
    const returnCollector =
      interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) =>
          i.customId === `return-to-main-${encounter.id}` &&
          i.user.id === userId,
        time: 60_000,
      });

    if (!returnCollector) return;

    returnCollector.on('collect', async (returnInteraction) => {
      await returnInteraction.deferUpdate();
      await this.showMainEncounterView(returnInteraction, encounter);
    });

    returnCollector.on('end', (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        // Remove the button after timeout to prevent stale interactions
        interaction.editReply({
          content: successMessage,
          components: [],
        });
      }
    });
  }

  private async showMainEncounterView(
    interaction: ButtonInteraction,
    encounter: EncounterDocument,
  ): Promise<void> {
    try {
      const progPoints = await this.encountersService.getProgPoints(
        encounter.id,
      );

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

      await interaction.editReply({
        content: '',
        embeds: [embed],
        components: [],
      });
    } catch (error) {
      this.logger.error(error, 'Error showing main encounter view');
      await interaction.editReply({
        content: '❌ An error occurred while loading the main view.',
        embeds: [],
        components: [],
      });
    }
  }

  private getStatusEmoji(status: PartyStatus): string {
    switch (status) {
      case PartyStatus.EarlyProgParty:
        return '🟡';
      case PartyStatus.ProgParty:
        return '🟠';
      case PartyStatus.ClearParty:
        return '🔵';
      case PartyStatus.Cleared:
        return '🟢';
      default:
        return '⚪';
    }
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
