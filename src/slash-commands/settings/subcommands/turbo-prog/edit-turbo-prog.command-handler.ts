import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { MessageFlags } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SentryTraced } from '../../../../sentry/sentry-traced.decorator.js';
import { sentryReport } from '../../../../sentry/sentry.consts.js';
import { EditTurboProgCommand } from './edit-turbo-prog.command.js';

@CommandHandler(EditTurboProgCommand)
export class EditTurboProgCommandHandler
  implements ICommandHandler<EditTurboProgCommand>
{
  private readonly logger = new Logger(EditTurboProgCommandHandler.name);

  constructor(private readonly settingsCollection: SettingsCollection) {}

  @SentryTraced()
  async execute({ interaction }: EditTurboProgCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const active = interaction.options.getBoolean('active', true);
      const spreadsheetId = interaction.options.getString('spreadsheet-id');

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        turboProgActive: active,
        turboProgSpreadsheetId: spreadsheetId ?? undefined,
      });

      await interaction.editReply('Turbo prog settings updated!');
    } catch (e: unknown) {
      sentryReport(e);
      this.logger.error(e);
      return interaction.editReply('Something went wrong!');
    }
  }
}
