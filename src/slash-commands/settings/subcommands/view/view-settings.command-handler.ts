import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { EmbedBuilder, roleMention } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SentryTraced } from '../../../../sentry/sentry-traced.decorator.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
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
      modChannelId,
      signupChannel,
      progRoles,
      turboProgActive,
      turboProgSpreadsheetId,
    } = settings;
    const role = reviewerRole ? roleMention(reviewerRole) : 'No Role Set';
    const publicSignupChannel = signupChannel
      ? `<#${signupChannel}>`
      : 'No Channel Set';

    const moderationChannel = modChannelId
      ? `<#${modChannelId}>`
      : 'No Channel Set';

    const progRoleSettings = Object.entries(progRoles || {}).reduce<string[]>(
      (acc, [encounter, role]) => {
        if (role) {
          acc.push(`**${encounter}** - <@&${role}>`);
        }
        return acc;
      },
      [],
    );

    const clearRoleSettings = Object.entries(settings.clearRoles || {}).reduce<
      string[]
    >((acc, [encounter, role]) => {
      if (role) {
        acc.push(`**${encounter}:** - <@&${role}>`);
      }
      return acc;
    }, []);

    const fields = [
      { name: 'Moderation Channel', value: moderationChannel, inline: true },
      { name: 'Review Channel', value: `<#${reviewChannel}>`, inline: true },
      { name: 'Signup Channel', value: publicSignupChannel, inline: true },
      { name: 'Reviewer Role', value: role, inline: true },
      {
        name: 'Clear Roles',
        value: clearRoleSettings.length
          ? clearRoleSettings.join('\n')
          : 'No roles set',
        inline: true,
      },
      {
        name: 'Prog Roles',
        value: progRoleSettings.length
          ? progRoleSettings.join('\n')
          : 'No roles set',
        inline: true,
      },
      {
        name: 'Turbo Prog Active',
        value: turboProgActive ? 'Yes' : 'No',
        inline: true,
      },
    ];

    if (turboProgSpreadsheetId) {
      const { title, url } = await this.sheetsService.getSheetMetadata(
        turboProgSpreadsheetId,
      );
      fields.push({
        name: 'Turbo Prog Spreadsheet',
        value: `[${title}](${url})`,
        inline: true,
      });
    }

    if (spreadsheetId) {
      const { title, url } =
        await this.sheetsService.getSheetMetadata(spreadsheetId);
      fields.push({
        name: 'Managed Spreadsheet',
        value: `[${title}](${url})`,
        inline: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('Settings')
      .setDescription('Ulti-Project Bot Settings')
      .addFields(fields);

    await interaction.editReply({ embeds: [embed] });
  }
}

export { ViewSettingsCommandHandler };
