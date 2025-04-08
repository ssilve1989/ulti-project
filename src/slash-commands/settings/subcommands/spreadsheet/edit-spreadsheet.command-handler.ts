import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { MessageFlags } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SentryTraced } from '../../../../sentry/sentry-traced.decorator.js';
import { sentryReport } from '../../../../sentry/sentry.consts.js';
import { EditSpreadsheetCommand } from './edit-spreadsheet.command.js';

@CommandHandler(EditSpreadsheetCommand)
export class EditSpreadsheetCommandHandler
  implements ICommandHandler<EditSpreadsheetCommand>
{
  private readonly logger = new Logger(EditSpreadsheetCommandHandler.name);

  constructor(private readonly settingsCollection: SettingsCollection) {}

  @SentryTraced()
  async execute({ interaction }: EditSpreadsheetCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const spreadsheetId = interaction.options.getString(
        'spreadsheet-id',
        true,
      );

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        spreadsheetId,
      });

      await interaction.editReply('Spreadsheet settings updated!');
    } catch (e: unknown) {
      sentryReport(e);
      this.logger.error(e);
      return interaction.editReply('Something went wrong!');
    }
  }
}
