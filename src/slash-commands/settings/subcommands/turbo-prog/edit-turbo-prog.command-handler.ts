import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditTurboProgCommand } from './edit-turbo-prog.command.js';

@CommandHandler(EditTurboProgCommand)
export class EditTurboProgCommandHandler
  implements ICommandHandler<EditTurboProgCommand>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: EditTurboProgCommand) {
    const scope = Sentry.getCurrentScope();

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const active = interaction.options.getBoolean('active', true);
      const spreadsheetId = interaction.options.getString('spreadsheet-id');

      // Add command-specific context
      scope.setContext('turbo_prog_update', {
        active,
        hasSpreadsheetId: !!spreadsheetId,
        spreadsheetId,
      });

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        turboProgActive: active,
        turboProgSpreadsheetId: spreadsheetId ?? undefined,
      });

      await interaction.editReply('Turbo prog settings updated!');
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
