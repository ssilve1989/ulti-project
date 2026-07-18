import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import { SettingsEditCommandHandler } from '../../settings-edit-command.handler.js';

interface SpreadsheetOptions {
  spreadsheetId: string;
}

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'spreadsheet' })
class EditSpreadsheetCommandHandler extends SettingsEditCommandHandler<SpreadsheetOptions> {
  protected readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): SpreadsheetOptions {
    return {
      spreadsheetId: interaction.options.getString('spreadsheet-id', true),
    };
  }

  protected scopeContext({ spreadsheetId }: SpreadsheetOptions) {
    return { name: 'spreadsheet_update', context: { spreadsheetId } };
  }

  protected buildPatch({ spreadsheetId }: SpreadsheetOptions) {
    return { spreadsheetId };
  }

  protected successMessage(): string {
    return 'Spreadsheet settings updated!';
  }
}

export { EditSpreadsheetCommandHandler };
