import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { roleMention } from 'discord.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SentryTraced } from '../../../observability/span.decorator.js';
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

  @SentryTraced()
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
      turboProgActive,
      turboProgSpreadsheetId,
    } = settings;
    const role = reviewerRole ? roleMention(reviewerRole) : 'No Role Set';
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

    const clearRoleSettings = Object.entries(settings.clearRoles || {}).reduce<
      string[]
    >((acc, [encounter, role]) => {
      if (role) {
        acc.push(`**${encounter} Clear Role:** <@&${role}>`);
      }
      return acc;
    }, []);

    const messages = [
      `**Review Channel:** <#${reviewChannel}>`,
      `**Reviewer Role:** ${role}`,
      `**Signup Channel:** ${publicSignupChannel}`,
      `**Turbo Prog Active:** ${turboProgActive ? 'Yes' : 'No'}`,
    ];

    if (turboProgSpreadsheetId) {
      const { title, url } = await this.sheetsService.getSheetMetadata(
        turboProgSpreadsheetId,
      );

      messages.push(`**Turbo Prog Spreadsheet:** [${title}](${url})`);
    }

    if (spreadsheetId) {
      const { title, url } =
        await this.sheetsService.getSheetMetadata(spreadsheetId);

      messages.push(`**Managed Spreadsheet:** [${title}](${url})`);
    }

    messages.push(...progRoleSettings, ...clearRoleSettings);

    await interaction.editReply(messages.join('\n'));
  }
}

export { ViewSettingsCommandHandler };
