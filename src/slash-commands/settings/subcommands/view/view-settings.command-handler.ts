import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  EmbedBuilder,
  MessageFlags,
  channelMention,
  roleMention,
} from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SentryTraced } from '../../../../sentry/sentry-traced.decorator.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { ViewSettingsCommand } from './view-settings.command.js';

function formatRole(roleId?: string) {
  return roleId ? roleMention(roleId) : 'No Role Set';
}

function formatChannel(channelId?: string) {
  return channelId ? channelMention(channelId) : 'No Channel Set';
}

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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    if (!settings) {
      await interaction.editReply('No settings found!');
      return;
    }

    const {
      modChannelId,
      progRoles,
      reviewChannel,
      reviewerRole,
      signupChannel,
      spreadsheetId,
      turboProgActive,
      turboProgSpreadsheetId,
    } = settings;

    const progRoleSettings = Object.entries(progRoles || {}).reduce<string[]>(
      (acc, [encounter, role]) => {
        if (role) {
          acc.push(`**${encounter}** - ${roleMention(role)}`);
        }
        return acc;
      },
      [],
    );

    const clearRoleSettings = Object.entries(settings.clearRoles || {}).reduce<
      string[]
    >((acc, [encounter, role]) => {
      if (role) {
        acc.push(`**${encounter}:** - ${roleMention(role)}`);
      }
      return acc;
    }, []);

    const fields = [
      {
        name: 'Moderation Channel',
        value: formatChannel(modChannelId),
        inline: true,
      },
      {
        name: 'Review Channel',
        value: formatChannel(reviewChannel),
        inline: true,
      },
      {
        name: 'Signup Channel',
        value: formatChannel(signupChannel),
        inline: true,
      },
      {
        name: 'Reviewer Role',
        value: formatRole(reviewerRole),
        inline: true,
      },
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
