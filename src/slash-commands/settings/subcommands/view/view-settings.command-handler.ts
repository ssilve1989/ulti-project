import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import {
  channelMention,
  EmbedBuilder,
  MessageFlags,
  roleMention,
} from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { ViewSettingsCommand } from './view-settings.command.js';

function formatRole(roleId?: string) {
  return roleId ? roleMention(roleId) : 'No Role Set';
}

function formatChannel(channelId?: string) {
  return channelId ? channelMention(channelId) : 'No Channel Set';
}

function reduceRoleSettings(
  roleSettings: Record<string, string | undefined> | undefined,
): string[] {
  return Object.entries(roleSettings || {}).reduce<string[]>(
    (acc, [encounter, role]) => {
      if (role) {
        acc.push(`**${encounter}:** ${roleMention(role)}`);
      }
      return acc;
    },
    [],
  );
}

@CommandHandler(ViewSettingsCommand)
class ViewSettingsCommandHandler
  implements ICommandHandler<ViewSettingsCommand>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly sheetsService: SheetsService,
    private readonly errorService: ErrorService,
  ) {}

  private async buildSpreadsheetField(name: string, spreadsheetId: string) {
    try {
      const { title, url } =
        await this.sheetsService.getSheetMetadata(spreadsheetId);
      return { name, value: `[${title}](${url})`, inline: true };
    } catch (error) {
      this.errorService.captureError(error);
      return {
        name,
        value: 'Unable to fetch sheet info',
        inline: true,
      };
    }
  }

  @SentryTraced()
  async execute({ interaction }: ViewSettingsCommand): Promise<void> {
    const scope = Sentry.getCurrentScope();
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      if (!settings) {
        await interaction.editReply('No settings found!');
        return;
      }

      // Add context about the retrieved settings
      scope.setContext('settings_data', {
        hasSpreadsheet: !!settings.spreadsheetId,
        hasTurboProgSpreadsheet: !!settings.turboProgSpreadsheetId,
        turboProgActive: settings.turboProgActive,
        configuredChannels: [
          settings.autoModChannelId,
          settings.reviewChannel,
          settings.signupChannel,
        ].filter(Boolean).length,
        configuredRoles:
          Object.keys(settings.progRoles || {}).length +
          Object.keys(settings.clearRoles || {}).length,
      });

      const {
        autoModChannelId,
        progRoles,
        clearRoles,
        reviewChannel,
        reviewerRole,
        signupChannel,
        spreadsheetId,
        turboProgActive,
        turboProgSpreadsheetId,
      } = settings;

      const progRoleSettings = reduceRoleSettings(progRoles);
      const clearRoleSettings = reduceRoleSettings(clearRoles);

      const fields = [
        {
          name: 'Auto-Moderation Channel',
          value: formatChannel(autoModChannelId),
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
        fields.push(
          await this.buildSpreadsheetField(
            'Turbo Prog Spreadsheet',
            turboProgSpreadsheetId,
          ),
        );
      }

      if (spreadsheetId) {
        fields.push(
          await this.buildSpreadsheetField(
            'Managed Spreadsheet',
            spreadsheetId,
          ),
        );
      }

      const embed = new EmbedBuilder()
        .setTitle('Settings')
        .setDescription('Ulti-Project Bot Settings')
        .addFields(fields);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}

export { ViewSettingsCommandHandler };
