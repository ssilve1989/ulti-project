import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ViewSettingsCommand } from '../view-settings.command.js';
import { SettingsService } from '../../settings.service.js';
import { SheetsService } from '../../../sheets/sheets.service.js';

@CommandHandler(ViewSettingsCommand)
class ViewSettingsCommandHandler
  implements ICommandHandler<ViewSettingsCommand>
{
  constructor(
    private readonly settingsService: SettingsService,
    private readonly sheetsService: SheetsService,
  ) {}

  async execute({ interaction }: ViewSettingsCommand) {
    await interaction.deferReply({ ephemeral: true });

    const settings = await this.settingsService.getSettings(
      interaction.guildId,
    );

    if (!settings) {
      return interaction.editReply('No settings found!');
    }

    const { reviewChannel, reviewerRole, spreadsheetId } = settings;
    const role = reviewerRole ? `<@&${reviewerRole}>` : 'No Role Set';

    const messages = [
      `**Review Channel:** <#${reviewChannel}>`,
      `**Reviewer Role:** ${role}`,
    ];

    if (spreadsheetId) {
      const { title, url } =
        await this.sheetsService.getSheetMetadata(spreadsheetId);

      messages.push(`**Managaed Spreadsheet:** [${title}](${url})`);
    }

    await interaction.editReply(messages.join('\n'));
  }
}

export { ViewSettingsCommandHandler };
