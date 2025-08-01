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
  EmbedBuilder,
  type Interaction,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { isSameUserFilter } from '../../../common/collection-filters.js';
import { EncountersService } from '../../../encounters/encounters.service.js';
import { ThresholdError } from '../../../encounters/errors/threshold.error.js';
import { ErrorService } from '../../../error/error.service.js';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '../../../firebase/models/encounter.model.js';
import { PartyStatus } from '../../../firebase/models/signup.model.js';
import { ManageProgPointsCommand } from '../commands/encounters.commands.js';
import {
  type PendingAddOperation,
  type PendingPartyStatusOperation,
  type PendingReorderOperation,
  type PendingToggleOperation,
  type ProgPointCollector,
  type ProgPointError,
  ScreenState,
} from './manage-prog-points.interfaces.js';
import {
  createBackButtonRow,
  createSuccessWithReturnButton,
} from './manage-prog-points.utils.js';

function isThresholdError(error: unknown): error is ThresholdError {
  return error instanceof ThresholdError;
}

/**
 * This handler was made by several different AI Models and could use some TLC.
 */
@CommandHandler(ManageProgPointsCommand)
export class ManageProgPointsCommandHandler
  implements ICommandHandler<ManageProgPointsCommand>
{
  private readonly logger = new Logger(ManageProgPointsCommandHandler.name);

  // State management for single collector architecture
  private currentState: ScreenState = ScreenState.MAIN_MENU;
  private collector: ProgPointCollector | null = null;
  private originalInteraction: ChatInputCommandInteraction | null = null;
  private currentEncounter: EncounterDocument | null = null;
  private currentProgPoints: ProgPointDocument[] = [];

  // Type-safe pending operation state for multi-step flows
  private pendingAddOperation: PendingAddOperation | null = null;
  private pendingPartyStatusOperation: PendingPartyStatusOperation | null =
    null;
  private pendingReorderOperation: PendingReorderOperation | null = null;
  private pendingToggleOperation: PendingToggleOperation | null = null;

  constructor(
    private readonly encountersService: EncountersService,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({
    interaction,
    encounterId,
  }: ManageProgPointsCommand): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await this.initializeProgPointsManager(interaction, encounterId);
    } catch (error) {
      this.errorService.captureError(error);
      await interaction.editReply({
        content:
          '❌ An error occurred while loading prog points. Please try again.',
      });
    }
  }

  private async initializeProgPointsManager(
    interaction: ChatInputCommandInteraction,
    encounterId: string,
  ): Promise<void> {
    this.originalInteraction = interaction;
    this.currentState = ScreenState.MAIN_MENU;

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

    this.currentEncounter = encounter;
    this.currentProgPoints = progPoints;

    await this.showMainMenu();
    this.setupCollector();
  }

  private setupCollector(): void {
    if (!this.originalInteraction) return;

    const collectorInstance =
      this.originalInteraction.channel?.createMessageComponentCollector({
        filter: isSameUserFilter(this.originalInteraction.user),
        time: 300_000, // 5 minutes
      });

    if (!collectorInstance) return;

    this.collector = collectorInstance;

    // TypeScript: collector is definitely not null after assignment
    const collector = this.collector;
    collector.on('collect', async (componentInteraction: Interaction) => {
      try {
        await this.routeInteraction(componentInteraction);
      } catch (error: unknown) {
        this.logger.error(error, 'Error handling prog point action');

        // If we get an expired interaction error, stop the collector immediately
        const progPointError = error as ProgPointError;
        if (progPointError?.code === 10062) {
          this.logger.warn('Interaction expired, stopping collector');
          collector.stop('expired');
          return;
        }

        await this.handleCollectorError(progPointError, componentInteraction);
      }
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'expired') {
        // Handle expired interactions - don't try to edit the message
        this.logger.log('Collector stopped due to expired interaction');
        return;
      }

      if (reason === 'finished') {
        // Handle user-initiated finish - message already updated by handleFinishInteraction
        this.logger.log('Collector stopped - user finished interaction');
        return;
      }

      if (
        reason === 'time' &&
        collected.size === 0 &&
        this.originalInteraction
      ) {
        // Only try to edit if we have a valid original interaction
        try {
          this.originalInteraction.editReply({
            content: '⏰ Prog point management timed out.',
            components: [],
            embeds: [],
          });
        } catch (error: unknown) {
          const progPointError = error as ProgPointError;
          this.logger.warn('Failed to edit reply on timeout', {
            error: progPointError?.message,
          });
        }
      }
    });
  }

  private async routeInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isMessageComponent()) return;

    // Validate interaction before processing
    if (!this.validateAndHandleExpiredInteraction(interaction)) {
      return;
    }

    // Try global interaction routing first
    if (await this.handleGlobalInteractions(interaction)) {
      return;
    }

    // Handle custom ID-specific interactions
    if (await this.handleCustomIdInteractions(interaction)) {
      return;
    }

    // Handle state-specific interactions
    await this.handleStateSpecificInteractions(interaction);
  }

  /**
   * Validates interaction and handles expired interactions
   * @returns true if interaction is valid, false if expired/invalid
   */
  private validateAndHandleExpiredInteraction(
    interaction: Interaction,
  ): boolean {
    if (!this.isValidInteraction(interaction)) {
      const messageComponent = interaction as
        | ButtonInteraction
        | StringSelectMenuInteraction;
      this.logger.warn('Attempting to process invalid/expired interaction', {
        customId: messageComponent.customId,
        replied: messageComponent.replied,
        deferred: messageComponent.deferred,
        age: Date.now() - interaction.createdTimestamp,
      });

      // If the interaction is expired, stop the collector
      const interactionAge = Date.now() - interaction.createdTimestamp;
      if (interactionAge > 15 * 60 * 1000) {
        this.logger.warn('Stopping collector due to expired interaction');
        this.collector?.stop('expired');
      }

      return false;
    }
    return true;
  }

  /**
   * Handle global interactions that work from any screen
   * @returns true if interaction was handled
   */
  private async handleGlobalInteractions(
    interaction: Interaction,
  ): Promise<boolean> {
    const messageComponent = interaction as
      | ButtonInteraction
      | StringSelectMenuInteraction;
    const customId = messageComponent.customId;

    // Handle return to main menu from any screen
    if (
      customId.includes('return-to-main') ||
      customId.includes('back-to-main')
    ) {
      await this.returnToMainMenu(interaction);
      return true;
    }

    return false;
  }

  /**
   * Handle specific custom ID patterns
   * @returns true if interaction was handled
   */
  private async handleCustomIdInteractions(
    interaction: Interaction,
  ): Promise<boolean> {
    const messageComponent = interaction as
      | ButtonInteraction
      | StringSelectMenuInteraction;
    const customId = messageComponent.customId;

    // Handle position selection for add flow
    if (customId.startsWith('select-position-')) {
      await this.handlePositionSelection(
        interaction as StringSelectMenuInteraction,
      );
      return true;
    }

    // Handle party status selection
    if (customId.startsWith('party-status-select-')) {
      await this.handlePartyStatusSelection(
        interaction as StringSelectMenuInteraction,
      );
      return true;
    }

    // Handle reorder point selection
    if (customId === 'select-prog-point-to-move') {
      await this.handleReorderProgPointSelection(
        interaction as StringSelectMenuInteraction,
      );
      return true;
    }

    // Handle reorder position selection
    if (customId.startsWith('select-new-position-')) {
      await this.handleReorderPositionSelection(
        interaction as StringSelectMenuInteraction,
      );
      return true;
    }

    return false;
  }

  /**
   * Handle state-specific interactions based on current screen state
   */
  private async handleStateSpecificInteractions(
    interaction: Interaction,
  ): Promise<void> {
    switch (this.currentState) {
      case ScreenState.MAIN_MENU:
        await this.handleMainMenuInteraction(interaction);
        break;
      case ScreenState.TOGGLE_SELECTION:
        await this.handleToggleSelectionInteraction(interaction);
        break;
      case ScreenState.TOGGLE_CONFIRMATION:
        await this.handleToggleConfirmationInteraction(interaction);
        break;
      case ScreenState.EDIT_SELECTION:
        await this.handleEditSelectionInteraction(interaction);
        break;
      case ScreenState.DELETE_SELECTION:
        await this.handleDeleteSelectionInteraction(interaction);
        break;
      case ScreenState.REORDER:
        await this.handleReorderInteraction(interaction);
        break;
      case ScreenState.REORDER_POSITION:
        // Position selection is handled by custom ID routing above
        break;
    }
  }

  private async handleMainMenuInteraction(
    interaction: Interaction,
  ): Promise<void> {
    if (!interaction.isButton()) return;

    switch (interaction.customId) {
      case 'add-prog-point':
        // Don't defer - modal needs to be shown first
        await this.handleAddProgPoint(interaction);
        break;
      case 'edit-prog-point':
        await this.safelyDeferUpdate(interaction);
        this.currentState = ScreenState.EDIT_SELECTION;
        await this.showEditSelection();
        break;
      case 'toggle-prog-point':
        await this.safelyDeferUpdate(interaction);
        this.currentState = ScreenState.TOGGLE_SELECTION;
        await this.showToggleSelection();
        break;
      case 'delete-prog-point':
        await this.safelyDeferUpdate(interaction);
        this.currentState = ScreenState.DELETE_SELECTION;
        await this.showDeleteSelection();
        break;
      case 'reorder-prog-points':
        await this.safelyDeferUpdate(interaction);
        this.currentState = ScreenState.REORDER;
        await this.showReorderSelection();
        break;
      case 'finish-interaction':
        await this.handleFinishInteraction(interaction);
        break;
    }
  }

  private async handleToggleSelectionInteraction(
    interaction: Interaction,
  ): Promise<void> {
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'select-prog-point-toggle'
    ) {
      await this.safelyDeferUpdate(interaction);
      const selectedProgPointIds = new Set(interaction.values);

      // Find the selected prog points
      const selectedProgPoints = this.currentProgPoints.filter((p) =>
        selectedProgPointIds.has(p.id),
      );

      if (selectedProgPoints.length === 0) {
        await this.updateMessage('❌ No prog points found.', [], []);
        return;
      }

      // If only one prog point selected, use existing single toggle logic
      if (selectedProgPoints.length === 1) {
        await this.executeToggle(selectedProgPoints[0]);
        return;
      }

      // Separate into points to activate and deactivate
      const progPointsToActivate = selectedProgPoints.filter((p) => !p.active);
      const progPointsToDeactivate = selectedProgPoints.filter((p) => p.active);

      // Store pending operation
      this.pendingToggleOperation = {
        selectedProgPointIds,
        progPointsToActivate,
        progPointsToDeactivate,
      };

      // Move to confirmation screen
      this.currentState = ScreenState.TOGGLE_CONFIRMATION;
      await this.showToggleConfirmation();
    }
  }

  private async handleToggleConfirmationInteraction(
    interaction: Interaction,
  ): Promise<void> {
    if (!interaction.isButton()) return;

    switch (interaction.customId) {
      case 'confirm-bulk-toggle':
        await this.safelyDeferUpdate(interaction);
        await this.executeBulkToggle();
        break;
      case 'cancel-bulk-toggle':
        await this.safelyDeferUpdate(interaction);
        this.pendingToggleOperation = null;
        this.currentState = ScreenState.TOGGLE_SELECTION;
        await this.showToggleSelection();
        break;
      case 'back-to-main-from-toggle':
        await this.safelyDeferUpdate(interaction);
        this.pendingToggleOperation = null;
        await this.returnToMainMenu(interaction);
        break;
    }
  }

  private async handleEditSelectionInteraction(
    interaction: Interaction,
  ): Promise<void> {
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'select-prog-point-edit'
    ) {
      const progPointId = interaction.values[0];
      const progPoint = this.currentProgPoints.find(
        (p) => p.id === progPointId,
      );

      if (!progPoint) {
        await interaction.reply({
          content: '❌ Prog point not found.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Don't defer - modal needs to be shown first
      await this.showEditModal(interaction, progPoint);
    }
  }

  private async handleDeleteSelectionInteraction(
    interaction: Interaction,
  ): Promise<void> {
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'select-prog-point-delete'
    ) {
      await this.safelyDeferUpdate(interaction);
      const progPointId = interaction.values[0];
      const progPoint = this.currentProgPoints.find(
        (p) => p.id === progPointId,
      );

      if (!progPoint) {
        await this.updateMessage('❌ Prog point not found.', [], []);
        return;
      }

      await this.showDeleteConfirmation(progPoint);
    } else if (
      interaction.isButton() &&
      interaction.customId.startsWith('confirm-delete-')
    ) {
      await this.safelyDeferUpdate(interaction);
      const progPointId = interaction.customId.replace('confirm-delete-', '');
      const progPoint = this.currentProgPoints.find(
        (p) => p.id === progPointId,
      );

      if (progPoint) {
        await this.executeDelete(progPoint);
      }
    } else if (
      interaction.isButton() &&
      interaction.customId === 'cancel-delete'
    ) {
      await this.safelyDeferUpdate(interaction);
      this.currentState = ScreenState.DELETE_SELECTION;
      await this.showDeleteSelection();
    }
  }

  private async handleReorderInteraction(
    interaction: Interaction,
  ): Promise<void> {
    // Stub for reorder functionality
    if (interaction.isMessageComponent()) {
      await this.safelyDeferUpdate(interaction);
    }
    await this.updateMessage('🚧 Reorder functionality coming soon!', [], []);
  }

  private async showMainMenu(): Promise<void> {
    if (!this.currentEncounter || !this.originalInteraction) return;

    const embed = new EmbedBuilder()
      .setTitle(`Manage Prog Points - ${this.currentEncounter.name}`)
      .setColor(Colors.Blue);

    // Add current prog points list
    if (this.currentProgPoints.length > 0) {
      const progPointsList = this.currentProgPoints
        .map((p, index) => {
          const statusIcon = p.active ? '✅' : '❌';
          return `${index + 1}. ${statusIcon} **${p.label}** (${p.partyStatus})`;
        })
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
        .setDisabled(this.currentProgPoints.length === 0),
      new ButtonBuilder()
        .setCustomId('toggle-prog-point')
        .setLabel('Toggle Active/Inactive')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
        .setDisabled(this.currentProgPoints.length === 0),
    );

    const actionButtons2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('delete-prog-point')
        .setLabel('Delete Prog Point')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setDisabled(this.currentProgPoints.length === 0),
      new ButtonBuilder()
        .setCustomId('reorder-prog-points')
        .setLabel('Reorder Prog Points')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
        .setDisabled(this.currentProgPoints.length < 2),
      new ButtonBuilder()
        .setCustomId('finish-interaction')
        .setLabel('Finished')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
    );

    await this.originalInteraction.editReply({
      embeds: [embed],
      components: [actionButtons1, actionButtons2],
    });
  }

  private async showToggleSelection(): Promise<void> {
    const selectOptions = this.createProgPointSelectionOptions();
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-prog-point-toggle')
      .setPlaceholder('Choose prog points to toggle (select multiple)...')
      .setMinValues(1)
      .setMaxValues(Math.min(selectOptions.length, 25))
      .addOptions(selectOptions);

    const selectRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    const buttonRow = createBackButtonRow('back-to-main-toggle');

    await this.updateMessage(
      'Select one or more prog points to toggle between active and inactive:',
      [],
      [selectRow, buttonRow],
    );
  }

  private async showEditSelection(): Promise<void> {
    const selectOptions = this.createProgPointSelectionOptions();
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-prog-point-edit')
      .setPlaceholder('Choose a prog point to edit...')
      .addOptions(selectOptions);

    const selectRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    const buttonRow = createBackButtonRow('back-to-main');

    await this.updateMessage(
      'Select a prog point to edit:',
      [],
      [selectRow, buttonRow],
    );
  }

  private async showDeleteSelection(): Promise<void> {
    const selectOptions = this.createProgPointSelectionOptions();
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-prog-point-delete')
      .setPlaceholder('Choose a prog point to delete permanently...')
      .addOptions(selectOptions);

    const selectRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    const buttonRow = createBackButtonRow('back-to-main-delete');

    await this.updateMessage(
      '⚠️ **WARNING**: Select a prog point to delete permanently. This action cannot be undone!',
      [],
      [selectRow, buttonRow],
    );
  }

  private async showToggleConfirmation(): Promise<void> {
    if (!this.pendingToggleOperation) return;

    const { progPointsToActivate, progPointsToDeactivate } =
      this.pendingToggleOperation;

    const embed = new EmbedBuilder()
      .setTitle('Confirm Toggle Action')
      .setColor(Colors.Yellow)
      .setDescription(
        '**Preview of changes:**\n\nAre you sure you want to toggle these prog points?',
      );

    // Add field for prog points being activated
    if (progPointsToActivate.length > 0) {
      const activatingList = progPointsToActivate
        .map((p, index) => `${index + 1}. ❌ **${p.label}** → ✅ **Active**`)
        .join('\n');

      embed.addFields({
        name: `Activating (${progPointsToActivate.length})`,
        value:
          activatingList.length > 1024
            ? `${activatingList.substring(0, 1020)}...`
            : activatingList,
        inline: false,
      });
    }

    // Add field for prog points being deactivated
    if (progPointsToDeactivate.length > 0) {
      const deactivatingList = progPointsToDeactivate
        .map((p, index) => `${index + 1}. ✅ **${p.label}** → ❌ **Inactive**`)
        .join('\n');

      embed.addFields({
        name: `Deactivating (${progPointsToDeactivate.length})`,
        value:
          deactivatingList.length > 1024
            ? `${deactivatingList.substring(0, 1020)}...`
            : deactivatingList,
        inline: false,
      });
    }

    const confirmButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm-bulk-toggle')
        .setLabel(
          `Yes, Toggle ${this.pendingToggleOperation.selectedProgPointIds.size} Prog Points`,
        )
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cancel-bulk-toggle')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('back-to-main-from-toggle')
        .setLabel('Back to Main Menu')
        .setStyle(ButtonStyle.Secondary),
    );

    await this.updateMessage('', [embed], [confirmButtons]);
  }

  private async showReorderSelection(): Promise<void> {
    if (!this.currentEncounter) return;

    // Show ALL prog points for reordering (both active and inactive can be moved)
    const sortedProgPoints = this.getAllProgPointsSorted();

    const embed = new EmbedBuilder()
      .setTitle('Reorder Prog Points')
      .setColor(Colors.Blue)
      .setDescription(
        'Select a prog point to move, then choose its new position:',
      )
      .addFields({
        name: 'Current Order (All Prog Points)',
        value: this.formatProgPointsForDisplay(sortedProgPoints),
        inline: false,
      });

    // Create select menu using centralized method
    const selectOptions = this.createProgPointSelectionOptions();
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-prog-point-to-move')
      .setPlaceholder('Choose a prog point to move...')
      .addOptions(selectOptions);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu,
    );

    const backButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('back-to-main-reorder')
        .setLabel('Back to Main Menu')
        .setStyle(ButtonStyle.Secondary),
    );

    await this.updateMessage('', [embed], [row, backButton]);
  }

  private async showDeleteConfirmation(
    progPoint: ProgPointDocument,
  ): Promise<void> {
    const confirmEmbed = new EmbedBuilder()
      .setTitle('🚨 PERMANENT DELETION WARNING')
      .setColor(Colors.Red)
      .setDescription(
        '**This action cannot be undone!**\n\nDeleting this prog point will:\n• Permanently remove it from the database\n• Remove it from all existing signups\n• Reorder remaining prog points automatically\n\n**Are you absolutely sure?**',
      )
      .addFields(
        { name: 'Prog Point to Delete', value: progPoint.label, inline: true },
        {
          name: 'Current Status',
          value: progPoint.active ? 'Active ✅' : 'Inactive ❌',
          inline: true,
        },
        { name: 'Party Status', value: progPoint.partyStatus, inline: true },
        {
          name: 'Order Position',
          value: (progPoint.order + 1).toString(),
          inline: true,
        },
      );

    const confirmButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm-delete-${progPoint.id}`)
        .setLabel('YES, DELETE PERMANENTLY')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cancel-delete')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('back-to-main-from-delete')
        .setLabel('Back to Main Menu')
        .setStyle(ButtonStyle.Secondary),
    );

    await this.updateMessage('', [confirmEmbed], [confirmButtons]);
  }

  private async executeToggle(progPoint: ProgPointDocument): Promise<void> {
    if (!this.currentEncounter) return;

    try {
      await this.encountersService.toggleProgPointActive(
        this.currentEncounter.id,
        progPoint.id,
      );

      const finalStatus = progPoint.active ? 'deactivated' : 'activated';
      await this.showSuccessWithReturnOption(
        `✅ Successfully ${finalStatus} prog point: **${progPoint.label}**`,
      );

      this.logger.log(
        `User ${this.originalInteraction?.user.id} ${finalStatus} prog point ${progPoint.id} in encounter ${this.currentEncounter.id}`,
      );
    } catch (error) {
      this.logger.error(error, 'Failed to toggle prog point');
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      await this.updateMessage(`❌ ${errorMessage}`, [], []);
    }
  }

  private async executeBulkToggle(): Promise<void> {
    if (!this.currentEncounter || !this.pendingToggleOperation) return;

    const {
      selectedProgPointIds,
      progPointsToActivate,
      progPointsToDeactivate,
    } = this.pendingToggleOperation;

    try {
      const allProgPoints = [
        ...progPointsToActivate,
        ...progPointsToDeactivate,
      ];
      const { successful, failed } =
        await this.processToggleOperations(allProgPoints);

      const successMessage = this.buildBulkToggleMessage(successful, failed);
      await this.showSuccessWithReturnOption(successMessage);

      this.logger.log(
        `User ${this.originalInteraction?.user.id} bulk toggled ${successful.length}/${selectedProgPointIds.size} prog points in encounter ${this.currentEncounter.id}`,
      );

      this.pendingToggleOperation = null;
    } catch (error) {
      this.logger.error(error, 'Failed to execute bulk toggle');
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      await this.updateMessage(
        `❌ Bulk toggle failed: ${errorMessage}`,
        [],
        [],
      );
    }
  }

  private async processToggleOperations(
    progPoints: ProgPointDocument[],
  ): Promise<{
    successful: ProgPointDocument[];
    failed: Array<{ progPoint: ProgPointDocument; error: unknown }>;
  }> {
    const encounterId = this.currentEncounter?.id;
    if (!encounterId) throw new Error('No encounter available');

    const togglePromises = progPoints.map(async (progPoint) => {
      try {
        await this.encountersService.toggleProgPointActive(
          encounterId,
          progPoint.id,
        );
        return { progPoint, success: true };
      } catch (error) {
        this.logger.error(
          error,
          `Failed to toggle prog point ${progPoint.id} (${progPoint.label})`,
        );
        return { progPoint, success: false, error };
      }
    });

    const results = await Promise.allSettled(togglePromises);

    const { successful, failed } = results.reduce(
      (acc, result, index) => {
        if (result.status === 'fulfilled') {
          const { progPoint, success, error } = result.value;
          if (success) {
            acc.successful.push(progPoint);
          } else {
            acc.failed.push({ progPoint, error });
          }
        } else {
          acc.failed.push({
            progPoint: progPoints[index],
            error: result.reason,
          });
        }
        return acc;
      },
      {
        successful: [] as ProgPointDocument[],
        failed: [] as Array<{ progPoint: ProgPointDocument; error: unknown }>,
      },
    );

    return { successful, failed };
  }

  private buildBulkToggleMessage(
    successful: ProgPointDocument[],
    failed: Array<{ progPoint: ProgPointDocument; error: unknown }>,
  ): string {
    const successMessage = this.buildSuccessMessage(successful);
    const failureMessage = this.buildFailureMessage(failed);

    if (successMessage && failureMessage) {
      return `${successMessage}\n\n${failureMessage}`;
    }
    return successMessage || failureMessage;
  }

  private buildSuccessMessage(successful: ProgPointDocument[]): string {
    if (successful.length === 0) return '';

    // Count based on original states (before toggle)
    // If original was inactive (!p.active), it got activated
    // If original was active (p.active), it got deactivated
    const activatedCount = successful.filter((p) => !p.active).length;
    const deactivatedCount = successful.filter((p) => p.active).length;

    const parts: string[] = [];
    if (activatedCount > 0) {
      parts.push(
        `activated ${activatedCount} prog point${activatedCount === 1 ? '' : 's'}`,
      );
    }
    if (deactivatedCount > 0) {
      parts.push(
        `deactivated ${deactivatedCount} prog point${deactivatedCount === 1 ? '' : 's'}`,
      );
    }

    return `✅ Successfully ${parts.join(' and ')}`;
  }

  private buildFailureMessage(
    failed: Array<{ progPoint: ProgPointDocument; error: unknown }>,
  ): string {
    if (failed.length === 0) return '';

    // Separate threshold errors from other errors
    const thresholdErrors = failed
      .map((f) => f.error)
      .filter((f) => isThresholdError(f));

    const otherErrors = failed.filter((f) => !isThresholdError(f.error));

    const messages: string[] = [];

    // Build threshold-specific error messages
    if (thresholdErrors.length > 0) {
      const thresholdMessages = thresholdErrors.map((error) => {
        const thresholdName =
          error.thresholdType === 'Prog Party' ? 'Prog Party' : 'Clear Party';
        return `🚫 **${error.progPointLabel}** - Cannot deactivate: Currently used as **${thresholdName} Threshold**`;
      });

      messages.push(...thresholdMessages);
      messages.push(
        '💡 Use `/encounters set-thresholds` to change thresholds first',
      );
    }

    // Build generic error messages for other failures
    if (otherErrors.length > 0) {
      const otherPointNames = otherErrors
        .map((f) => f.progPoint.label)
        .join(', ');
      messages.push(
        `❌ Failed to toggle ${otherErrors.length} prog point${otherErrors.length === 1 ? '' : 's'}: ${otherPointNames}`,
      );
    }

    return messages.join('\n\n');
  }

  private async executeDelete(progPoint: ProgPointDocument): Promise<void> {
    if (!this.currentEncounter) return;

    try {
      await this.encountersService.deleteProgPoint(
        this.currentEncounter.id,
        progPoint.id,
      );

      await this.showSuccessWithReturnOption(
        `🗑️ Successfully deleted prog point: **${progPoint.label}**\n\n⚠️ This prog point has been permanently removed from the database.`,
      );

      this.logger.log(
        `User ${this.originalInteraction?.user.id} permanently deleted prog point ${progPoint.id} from encounter ${this.currentEncounter.id}`,
      );
    } catch (error) {
      this.logger.error(error, 'Failed to delete prog point');
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      await this.updateMessage(`❌ ${errorMessage}`, [], []);
    }
  }

  private async showSuccessWithReturnOption(
    successMessage: string,
  ): Promise<void> {
    const { content, components } =
      createSuccessWithReturnButton(successMessage);
    await this.updateMessage(content, [], components);
  }

  private async returnToMainMenu(interaction: Interaction): Promise<void> {
    if (!interaction.isMessageComponent()) return;

    await this.safelyDeferUpdate(interaction);

    // Refresh data and return to main menu
    if (this.currentEncounter) {
      this.currentProgPoints = await this.encountersService.getAllProgPoints(
        this.currentEncounter.id,
      );
      this.currentState = ScreenState.MAIN_MENU;
      await this.showMainMenu();
    }
  }

  private async handleFinishInteraction(
    interaction: ButtonInteraction,
  ): Promise<void> {
    await this.safelyDeferUpdate(interaction);

    // Stop the collector cleanly
    this.collector?.stop('finished');

    // Update the message to show completion
    await this.originalInteraction?.editReply({
      content: '✅ Prog point management completed.',
      embeds: [],
      components: [],
    });

    this.logger.log(
      `User ${this.originalInteraction?.user.id} finished prog point management for encounter ${this.currentEncounter?.id}`,
    );
  }

  private async updateMessage(
    content: string,
    embeds: EmbedBuilder[],
    components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[],
  ): Promise<void> {
    if (!this.originalInteraction) return;

    await this.originalInteraction.editReply({
      content,
      embeds,
      components,
    });
  }

  private async handleAddProgPoint(
    interaction: ButtonInteraction,
  ): Promise<void> {
    if (!this.currentEncounter) return;

    // Step 1: Show modal for label input
    const modal = new ModalBuilder()
      .setCustomId(`add-prog-point-modal-${this.currentEncounter.id}`)
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
          i.customId === `add-prog-point-modal-${this.currentEncounter?.id}`,
      });

      // Defer the modal submission to acknowledge it
      await modalSubmission.deferUpdate();

      const shortName = modalSubmission.fields.getTextInputValue('short-name');
      const longName = modalSubmission.fields.getTextInputValue('long-name');

      // Use short name as ID (after cleaning it)
      const progPointId = this.generateProgPointId(shortName);
      const existingProgPoints = await this.encountersService.getProgPoints(
        this.currentEncounter.id,
      );
      if (existingProgPoints.some((p) => p.id === progPointId)) {
        await this.updateMessage(
          '❌ A prog point with a similar short name already exists. Please use a different short name.',
          [],
          [],
        );
        return;
      }

      // Step 2: Show position selection for new prog point on main message
      await this.showPositionSelect(modalSubmission, progPointId, longName);
    } catch (error) {
      this.logger.error(error, 'Failed to handle add prog point modal');
    }
  }

  private async showPositionSelect(
    interaction: ModalSubmitInteraction,
    progPointId: string,
    longName: string,
  ): Promise<void> {
    if (!this.currentEncounter) return;

    // Use ALL prog points (active and inactive) for accurate position numbering
    const sortedProgPoints = this.getAllProgPointsSorted();

    const positionOptions = sortedProgPoints.map((p, index) => {
      const statusText = p.active ? '' : ' (inactive)';
      const nextProgPoint = sortedProgPoints[index + 1];
      const nextStatusText = nextProgPoint?.active ? '' : ' (inactive)';

      return {
        label: `Position ${index + 2}`,
        value: (index + 1).toString(),
        description:
          index < sortedProgPoints.length - 1
            ? `After: ${p.label}${statusText}, Before: ${nextProgPoint.label}${nextStatusText}`
            : `After: ${p.label}${statusText} (At the end)`,
      };
    });

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
        .setCustomId('back-to-main-position')
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
        name: 'Current Order (All Prog Points)',
        value: this.formatProgPointsForDisplay(sortedProgPoints),
        inline: false,
      });
    }

    // Store current add operation state
    this.pendingAddOperation = {
      progPointId,
      longName,
      interaction,
      action: 'add',
    };

    await this.updateMessage('', [embed], [row, backButton]);
  }

  private async showPartyStatusSelect(
    progPointId: string,
    longName: string,
    action: 'add' | 'edit',
    insertPosition?: number,
  ): Promise<void> {
    if (!this.currentEncounter) return;

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
        .setCustomId('back-to-main')
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

    // Store current operation state
    this.pendingPartyStatusOperation = {
      progPointId,
      longName,
      action,
      insertPosition,
    };

    await this.updateMessage('', [embed], [row, backButton]);
  }

  private async showEditModal(
    interaction: StringSelectMenuInteraction,
    progPoint: ProgPointDocument,
  ): Promise<void> {
    if (!this.currentEncounter) return;

    // Step 1: Show modal for long name input only (short name/ID cannot be changed)
    const modal = new ModalBuilder()
      .setCustomId(`edit-prog-point-modal-${progPoint.id}`)
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

    await interaction.showModal(modal);

    // Handle modal submission
    try {
      const modalSubmission = await interaction.awaitModalSubmit({
        time: 300_000,
        filter: (i) => i.customId === `edit-prog-point-modal-${progPoint.id}`,
      });

      // Defer the modal submission immediately to acknowledge it
      await modalSubmission.deferUpdate();

      const newLongName = modalSubmission.fields.getTextInputValue('long-name');

      // Step 2: Show party status select menu with current status selected

      await this.showPartyStatusSelect(progPoint.id, newLongName, 'edit');
    } catch (_error) {
      // Modal was cancelled or timed out
      this.logger.debug('Modal cancelled or timed out, user can try again');
    }
  }

  private async handlePositionSelection(
    interaction: StringSelectMenuInteraction,
  ): Promise<void> {
    if (!this.pendingAddOperation || !this.currentEncounter) return;

    await this.safelyDeferUpdate(interaction);
    const selectedPosition = Number.parseInt(interaction.values[0]);

    // Store the position for later use and show party status selection
    await this.showPartyStatusSelect(
      this.pendingAddOperation.progPointId,
      this.pendingAddOperation.longName,
      'add',
      selectedPosition,
    );
  }

  private async handlePartyStatusSelection(
    interaction: StringSelectMenuInteraction,
  ): Promise<void> {
    if (!this.pendingPartyStatusOperation || !this.currentEncounter) return;

    await this.safelyDeferUpdate(interaction);
    const selectedStatus = interaction.values[0] as PartyStatus;

    try {
      if (this.pendingPartyStatusOperation.action === 'add') {
        if (this.pendingPartyStatusOperation.insertPosition !== undefined) {
          // Add with specific position - need to reorder existing prog points
          // Get fresh prog points from database and refresh our cache
          const existingProgPoints =
            await this.encountersService.getAllProgPoints(
              this.currentEncounter.id,
            );
          this.currentProgPoints = existingProgPoints;
          const sortedProgPoints = this.getAllProgPointsSorted();

          // Create new prog point with temporary order
          await this.encountersService.addProgPoint(this.currentEncounter.id, {
            id: this.pendingPartyStatusOperation.progPointId,
            label: this.pendingPartyStatusOperation.longName,
            partyStatus: selectedStatus,
          });

          // Create new order array with the new prog point inserted at the specified position
          const newProgPointIds = [...sortedProgPoints.map((p) => p.id)];
          newProgPointIds.splice(
            this.pendingPartyStatusOperation.insertPosition,
            0,
            this.pendingPartyStatusOperation.progPointId,
          );

          // Reorder all prog points
          await this.encountersService.reorderProgPoints(
            this.currentEncounter.id,
            newProgPointIds,
          );

          await this.showSuccessWithReturnOption(
            `✅ Successfully added prog point: **${this.pendingPartyStatusOperation.longName}** (ID: ${this.pendingPartyStatusOperation.progPointId}) at position ${this.pendingPartyStatusOperation.insertPosition + 1} with status **${selectedStatus}**`,
          );
        } else {
          // Add at the end (default behavior)
          await this.encountersService.addProgPoint(this.currentEncounter.id, {
            id: this.pendingPartyStatusOperation.progPointId,
            label: this.pendingPartyStatusOperation.longName,
            partyStatus: selectedStatus,
          });

          await this.showSuccessWithReturnOption(
            `✅ Successfully added prog point: **${this.pendingPartyStatusOperation.longName}** (ID: ${this.pendingPartyStatusOperation.progPointId}) with status **${selectedStatus}**`,
          );
        }

        this.logger.log(
          `User ${this.originalInteraction?.user.id} added prog point ${this.pendingPartyStatusOperation.progPointId} to encounter ${this.currentEncounter.id}`,
        );
      } else {
        // Handle edit case - ID is always unchanged now, so simple update
        await this.encountersService.updateProgPoint(
          this.currentEncounter.id,
          this.pendingPartyStatusOperation.progPointId,
          {
            label: this.pendingPartyStatusOperation.longName,
            partyStatus: selectedStatus,
          },
        );

        await this.showSuccessWithReturnOption(
          `✅ Successfully updated prog point: **${this.pendingPartyStatusOperation.longName}** (ID: ${this.pendingPartyStatusOperation.progPointId}) with status **${selectedStatus}**`,
        );

        this.logger.log(
          `User ${this.originalInteraction?.user.id} updated prog point ${this.pendingPartyStatusOperation.progPointId} in encounter ${this.currentEncounter.id}`,
        );
      }

      // Clear pending operations
      this.pendingAddOperation = null;
      this.pendingPartyStatusOperation = null;
    } catch (error) {
      this.logger.error(
        error,
        `Failed to ${this.pendingPartyStatusOperation?.action} prog point`,
      );
      await this.updateMessage(
        `❌ Failed to ${this.pendingPartyStatusOperation?.action} prog point. Please try again.`,
        [],
        [],
      );
    }
  }

  private async handleReorderProgPointSelection(
    interaction: StringSelectMenuInteraction,
  ): Promise<void> {
    if (!this.currentEncounter) return;

    await this.safelyDeferUpdate(interaction);
    const progPointToMove = interaction.values[0];

    // Get ALL prog points (active and inactive) for accurate position numbering
    const sortedProgPoints = this.getAllProgPointsSorted();

    const movingProgPoint = sortedProgPoints.find(
      (p) => p.id === progPointToMove,
    );

    if (!movingProgPoint) {
      await this.updateMessage('❌ Prog point not found.', [], []);
      return;
    }

    // Store reorder operation state
    this.pendingReorderOperation = {
      progPointToMove,
      sortedProgPoints,
    };

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

    const backButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('back-to-main-reorder-position')
        .setLabel('Back to Main Menu')
        .setStyle(ButtonStyle.Secondary),
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
            const prefix = p.id === progPointToMove ? '**→ ' : `${index + 1}. `;
            const suffix = p.id === progPointToMove ? '**' : '';
            return `${prefix}${p.label}${suffix}`;
          })
          .join('\n'),
        inline: false,
      });

    this.currentState = ScreenState.REORDER_POSITION;
    await this.updateMessage('', [positionEmbed], [positionRow, backButton]);
  }

  private async handleReorderPositionSelection(
    interaction: StringSelectMenuInteraction,
  ): Promise<void> {
    if (!this.pendingReorderOperation || !this.currentEncounter) return;

    await this.safelyDeferUpdate(interaction);
    const newPosition = Number.parseInt(interaction.values[0]);
    const { progPointToMove, sortedProgPoints } = this.pendingReorderOperation;

    const currentPosition = sortedProgPoints.findIndex(
      (p) => p.id === progPointToMove,
    );
    const movingProgPoint = sortedProgPoints.find(
      (p) => p.id === progPointToMove,
    );

    if (!movingProgPoint) {
      await this.updateMessage('❌ Prog point not found.', [], []);
      return;
    }

    if (newPosition === currentPosition) {
      await this.updateMessage(
        '✅ No changes made - prog point is already in that position.',
        [],
        [],
      );
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
        this.currentEncounter.id,
        newOrder,
      );

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Prog Points Reordered')
        .setColor(Colors.Green)
        .setDescription(
          `Successfully moved **${movingProgPoint.label}** to position ${newPosition + 1}`,
        )
        .addFields({
          name: 'New Order (All Prog Points)',
          value: this.formatProgPointsForDisplay(
            reorderedProgPoints,
            progPointToMove,
            '← Moved here',
          ),
          inline: false,
        });

      const returnButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('return-to-main')
          .setLabel('Back to Main Menu')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔙'),
      );

      await this.updateMessage('', [successEmbed], [returnButton]);

      this.logger.log(
        `User ${this.originalInteraction?.user.id} reordered prog points in encounter ${this.currentEncounter.id}`,
      );

      // Clear pending operation
      this.pendingReorderOperation = null;
    } catch (error) {
      this.logger.error(error, 'Failed to reorder prog points');
      await this.updateMessage(
        '❌ Failed to reorder prog points. Please try again.',
        [],
        [],
      );
    }
  }

  private async handleCollectorError(
    error: ProgPointError,
    interaction: Interaction,
  ): Promise<void> {
    try {
      // Check if it's an "Unknown interaction" error (expired interaction)
      if (
        error?.code === 10062 ||
        error?.message?.includes('Unknown interaction')
      ) {
        this.logger.warn('Interaction expired, stopping collector');
        this.collector?.stop('expired');
        await this.showExpiredMessage();
        return;
      }

      // Try to send an error message to the user if possible
      if (
        interaction.isRepliable() &&
        !interaction.replied &&
        !interaction.deferred
      ) {
        try {
          await interaction.reply({
            content: '❌ An error occurred. Please try again.',
            flags: MessageFlags.Ephemeral,
          });
        } catch (replyError) {
          this.logger.error(replyError, 'Failed to send error reply');
        }
      } else if (interaction.isRepliable() && interaction.deferred) {
        try {
          await interaction.followUp({
            content: '❌ An error occurred. Please try again.',
            flags: MessageFlags.Ephemeral,
          });
        } catch (followUpError) {
          this.logger.error(followUpError, 'Failed to send error followup');
        }
      }
    } catch (handlerError) {
      this.logger.error(handlerError, 'Error in error handler');
    }
  }

  private async showExpiredMessage(): Promise<void> {
    try {
      if (this.originalInteraction) {
        await this.originalInteraction.editReply({
          content:
            '⏰ This prog point management session has expired. Please run the command again.',
          embeds: [],
          components: [],
        });
      }
    } catch (error) {
      this.logger.error(error, 'Failed to show expired message');
    }
  }

  private isValidInteraction(interaction: Interaction): boolean {
    // Enhanced validation - check if interaction is still valid and not expired
    try {
      if (!interaction.isMessageComponent()) {
        return false;
      }

      // Check if interaction has already been replied to or deferred
      if (interaction.replied || interaction.deferred) {
        return false;
      }

      // Check interaction age - Discord interactions expire after 15 minutes
      const interactionAge = Date.now() - interaction.createdTimestamp;
      const fifteenMinutes = 15 * 60 * 1000;

      if (interactionAge > fifteenMinutes) {
        this.logger.warn(
          'Interaction is too old (>15 minutes), likely expired',
          {
            age: interactionAge,
            customId: interaction.customId,
          },
        );
        return false;
      }

      return true;
    } catch (error: unknown) {
      const progPointError = error as ProgPointError;
      this.logger.warn('Error validating interaction', {
        error: progPointError?.message,
      });
      return false;
    }
  }

  private async safelyDeferUpdate(interaction: Interaction): Promise<boolean> {
    try {
      if (
        interaction.isMessageComponent() &&
        !interaction.deferred &&
        !interaction.replied
      ) {
        await interaction.deferUpdate();
        return true;
      }
      return false;
    } catch (error: unknown) {
      const progPointError = error as ProgPointError;
      this.logger.warn('Failed to defer interaction update', {
        error: progPointError?.message,
        code: progPointError?.code,
      });
      // If deferring fails, the interaction is likely expired
      if (progPointError?.code === 10062) {
        throw progPointError; // Re-throw to be caught by main error handler
      }
      return false;
    }
  }

  /**
   * Get all prog points sorted by order (includes both active and inactive)
   * This is the source of truth for position numbering across the application
   */
  private getAllProgPointsSorted(): ProgPointDocument[] {
    return [...this.currentProgPoints].sort((a, b) => a.order - b.order);
  }

  /**
   * Format prog points for display with consistent active/inactive indicators
   */
  private formatProgPointsForDisplay(
    progPoints: ProgPointDocument[],
    highlightId?: string,
    highlightText?: string,
  ): string {
    return progPoints
      .map((p, index) => {
        const statusIcon = p.active ? '✅' : '❌';
        const statusText = p.active ? '' : ' (inactive)';
        const isHighlighted = p.id === highlightId;

        if (isHighlighted && highlightText) {
          return `**${index + 1}. ${statusIcon} ${p.label}${statusText}** ${highlightText}`;
        }
        return `${index + 1}. ${statusIcon} ${p.label}${statusText}`;
      })
      .join('\n');
  }

  /**
   * Create selection options for prog points (centralized for all dropdowns)
   * Always shows ALL prog points with consistent active/inactive indicators
   */
  private createProgPointSelectionOptions(): Array<{
    label: string;
    value: string;
    description: string;
  }> {
    const sortedProgPoints = this.getAllProgPointsSorted();

    return sortedProgPoints.map((progPoint, index) => {
      const statusIcon = progPoint.active ? '✅' : '❌';
      const statusText = progPoint.active ? '' : ' (inactive)';

      return {
        label: `${statusIcon} ${progPoint.label}${statusText}`,
        value: progPoint.id,
        description: `Position ${index + 1}`,
      };
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
