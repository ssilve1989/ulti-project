import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import { SettingsEditCommandHandler } from '../../settings-edit-command.handler.js';

interface TurboProgOptions {
  active: boolean;
  spreadsheetId: string | null;
}

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'turbo-prog' })
class EditTurboProgCommandHandler extends SettingsEditCommandHandler<TurboProgOptions> {
  protected readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): TurboProgOptions {
    return {
      active: interaction.options.getBoolean('active', true),
      spreadsheetId: interaction.options.getString('spreadsheet-id'),
    };
  }

  protected scopeContext({ active, spreadsheetId }: TurboProgOptions) {
    return {
      name: 'turbo_prog_update',
      context: {
        active,
        hasSpreadsheetId: !!spreadsheetId,
        spreadsheetId,
      },
    };
  }

  protected buildPatch({ active, spreadsheetId }: TurboProgOptions) {
    return {
      turboProgActive: active,
      turboProgSpreadsheetId: spreadsheetId ?? undefined,
    };
  }

  protected successMessage(): string {
    return 'Turbo prog settings updated!';
  }
}

export { EditTurboProgCommandHandler };
