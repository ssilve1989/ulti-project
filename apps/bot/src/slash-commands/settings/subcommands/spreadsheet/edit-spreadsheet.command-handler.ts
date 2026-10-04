import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'spreadsheet' })
class EditSpreadsheetCommandHandler implements ISlashCommand {
  constructor(private readonly settingsCollection: SettingsCollection) {}

  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const scope = Sentry.getCurrentScope();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const spreadsheetId = interaction.options.getString('spreadsheet-id', true);

    // Add command-specific context
    scope.setContext('spreadsheet_update', {
      spreadsheetId,
    });

    await this.settingsCollection.upsert(interaction.guildId, {
      spreadsheetId,
    });

    await interaction.editReply('Spreadsheet settings updated!');
  }
}

export { EditSpreadsheetCommandHandler };
