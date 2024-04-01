import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SheetsService } from '../../../sheets/sheets.service.js';
import { ViewSettingsCommand } from './view-settings.command.js';

@CommandHandler(ViewSettingsCommand)
class ViewSettingsCommandHandler
  implements ICommandHandler<ViewSettingsCommand>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly sheetsService: SheetsService,
  ) {}

  async execute({ interaction }: ViewSettingsCommand): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    if (!settings) {
      await interaction.editReply('No settings found!');
      return;
    }

    const {
      reviewChannel,
      reviewerRole,
      spreadsheetId,
      signupChannel,
      progRoles,
    } = settings;
    const role = reviewerRole ? `<@&${reviewerRole}>` : 'No Role Set';
    const publicSignupChannel = signupChannel
      ? `<#${signupChannel}>`
      : 'No Channel Set';

    const progRoleSettings = Object.entries(progRoles || {}).reduce<string[]>(
      (acc, [encounter, role]) => {
        if (role) {
          acc.push(`**${encounter} Prog Role:** <@&${role}>`);
        }
        return acc;
      },
      [],
    );

    const messages = [
      `**Review Channel:** <#${reviewChannel}>`,
      `**Reviewer Role:** ${role}`,
      `**Signup Channel:** ${publicSignupChannel}`,
      ...progRoleSettings,
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
