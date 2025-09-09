import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditSpreadsheetCommand } from './edit-spreadsheet.command.js';

@CommandHandler(EditSpreadsheetCommand)
export class EditSpreadsheetCommandHandler
  implements ICommandHandler<EditSpreadsheetCommand>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: EditSpreadsheetCommand) {
    const scope = Sentry.getCurrentScope();
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const spreadsheetId = interaction.options.getString(
        'spreadsheet-id',
        true,
      );

      // Add command-specific context
      scope.setContext('spreadsheet_update', {
        spreadsheetId,
      });

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        spreadsheetId,
      });

      await interaction.editReply('Spreadsheet settings updated!');
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
