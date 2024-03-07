import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ViewSettingsCommand } from './view-settings.command.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SheetsService } from '../../../sheets/sheets.service.js';

@CommandHandler(ViewSettingsCommand)
class ViewSettingsCommandHandler
  implements ICommandHandler<ViewSettingsCommand>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly sheetsService: SheetsService,
  ) {}

  async execute({ interaction }: ViewSettingsCommand) {
    await interaction.deferReply({ ephemeral: true });

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    if (!settings) {
      return interaction.editReply('No settings found!');
    }

    const { reviewChannel, reviewerRole, spreadsheetId, signupChannel } =
      settings;
    const role = reviewerRole ? `<@&${reviewerRole}>` : 'No Role Set';
    const publicSignupChannel = signupChannel
      ? `<#${signupChannel}>`
      : 'No Channel Set';

    const messages = [
      `**Review Channel:** <#${reviewChannel}>`,
      `**Reviewer Role:** ${role}`,
      `**Signup Channel:** ${publicSignupChannel}`,
    ];

    if (spreadsheetId) {
      const { title, url } =
        await this.sheetsService.getSheetMetadata(spreadsheetId);

      messages.push(`**Managed Spreadsheet:** [${title}](${url})`);
    }

    await interaction.editReply(messages.join('\n'));
  }
}

export { ViewSettingsCommandHandler };
