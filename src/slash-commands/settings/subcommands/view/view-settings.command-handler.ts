import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import type {
  ActionRowBuilder,
  APIEmbedField,
  ButtonBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { isSameUserFilter } from '../../../../common/collection-filters.js';
import type { Encounter } from '../../../../encounters/encounters.consts.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import {
  buildEncounterRolesEmbed,
  buildOverviewEmbed,
  buildProgPointRolesEmbed,
  createEncounterSelectRow,
  createNavRow,
  getConfiguredProgPointEncounters,
  SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID,
  SETTINGS_VIEW_ENCOUNTER_SELECT_ID,
  SETTINGS_VIEW_OVERVIEW_BUTTON_ID,
  SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID,
} from './view-settings.components.js';

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'view' })
class ViewSettingsCommandHandler implements ISlashCommand {
  private readonly logger = new Logger(ViewSettingsCommandHandler.name);

  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly sheetsService: SheetsService,
    private readonly errorService: ErrorService,
  ) {}

  private async buildSpreadsheetField(name: string, spreadsheetId: string) {
    try {
      const { title, url } =
        await this.sheetsService.getSheetMetadata(spreadsheetId);
      return { name, value: `[${title}](${url})`, inline: true };
    } catch (error) {
      this.errorService.captureError(error);
      return {
        name,
        value: 'Unable to fetch sheet info',
        inline: true,
      };
    }
  }

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const scope = Sentry.getCurrentScope();
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      if (!settings) {
        await interaction.editReply('No settings found!');
        return;
      }

      scope.setContext('settings_data', {
        hasSpreadsheet: !!settings.spreadsheetId,
        hasTurboProgSpreadsheet: !!settings.turboProgSpreadsheetId,
        turboProgActive: settings.turboProgActive,
        configuredChannels: [
          settings.autoModChannelId,
          settings.reviewChannel,
          settings.signupChannel,
        ].filter(Boolean).length,
        configuredRoles:
          Object.keys(settings.progRoles || {}).length +
          Object.keys(settings.clearRoles || {}).length +
          Object.values(settings.progPointRoles || {}).reduce<number>(
            (sum, mapping) => sum + Object.keys(mapping ?? {}).length,
            0,
          ),
      });

      // fetched once so navigating back to the overview never re-hits the Sheets API
      const spreadsheetFields: APIEmbedField[] = [];

      if (settings.turboProgSpreadsheetId) {
        spreadsheetFields.push(
          await this.buildSpreadsheetField(
            'Turbo Prog Spreadsheet',
            settings.turboProgSpreadsheetId,
          ),
        );
      }

      if (settings.spreadsheetId) {
        spreadsheetFields.push(
          await this.buildSpreadsheetField(
            'Managed Spreadsheet',
            settings.spreadsheetId,
          ),
        );
      }

      const configuredEncounters = getConfiguredProgPointEncounters(
        settings.progPointRoles,
      );

      const replyMessage = await interaction.editReply({
        embeds: [buildOverviewEmbed(settings, spreadsheetFields)],
        components: [createNavRow('overview')],
      });

      const collector = replyMessage.createMessageComponentCollector({
        filter: isSameUserFilter(interaction.user),
        time: 300000, // 5 minutes timeout
      });

      let selectedEncounter: Encounter | null = null;

      collector.on('collect', async (i) => {
        await i.deferUpdate();

        if (i.customId === SETTINGS_VIEW_OVERVIEW_BUTTON_ID) {
          await i.editReply({
            embeds: [buildOverviewEmbed(settings, spreadsheetFields)],
            components: [createNavRow('overview')],
          });
        } else if (i.customId === SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID) {
          await i.editReply({
            embeds: [buildEncounterRolesEmbed(settings)],
            components: [createNavRow('encounterRoles')],
          });
        } else if (i.customId === SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID) {
          const components: (
            | ActionRowBuilder<ButtonBuilder>
            | ActionRowBuilder<StringSelectMenuBuilder>
          )[] = [createNavRow('progPointRoles')];

          // an empty select menu is a Discord API error, so omit the row entirely
          if (configuredEncounters.length > 0) {
            components.push(
              createEncounterSelectRow(
                configuredEncounters,
                selectedEncounter ?? undefined,
              ),
            );
          }

          await i.editReply({
            embeds: [
              buildProgPointRolesEmbed(
                settings,
                selectedEncounter ?? undefined,
              ),
            ],
            components,
          });
        } else if (
          i.customId === SETTINGS_VIEW_ENCOUNTER_SELECT_ID &&
          i.isStringSelectMenu()
        ) {
          selectedEncounter = i.values[0] as Encounter;

          await i.editReply({
            embeds: [buildProgPointRolesEmbed(settings, selectedEncounter)],
            components: [
              createNavRow('progPointRoles'),
              createEncounterSelectRow(configuredEncounters, selectedEncounter),
            ],
          });
        }
      });

      collector.on('end', async () => {
        try {
          await interaction.editReply({
            content:
              'Settings view has expired. Run /settings view again if needed.',
            components: [],
          });
        } catch (error) {
          this.logger.error('Failed to update expired settings view', error);
        }
      });
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}

export { ViewSettingsCommandHandler };
