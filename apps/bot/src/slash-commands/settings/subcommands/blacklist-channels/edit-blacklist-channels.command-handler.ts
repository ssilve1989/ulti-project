import { Injectable, Logger } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';
import { channelMention } from 'discord.js';
import { isSameUserFilter } from '../../../../common/collection-filters.js';
import { getBlacklistChannelIds } from '../../../../firebase/models/settings.model.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import { SettingsSubcommandHandler } from '../../settings-subcommand.handler.js';
import {
  BLACKLIST_CHANNELS_SELECT_ID,
  createBlacklistChannelsSelectRow,
} from './blacklist-channels.components.js';

const INSTRUCTIONS =
  'Select the channels that should receive blacklist notifications. Your selection replaces the current list; submit an empty selection to disable notifications.';

@Injectable()
@SlashCommand({
  builder: SettingsSlashCommand,
  subcommand: 'blacklist-channels',
})
class EditBlacklistChannelsCommandHandler extends SettingsSubcommandHandler {
  private readonly logger = new Logger(
    EditBlacklistChannelsCommandHandler.name,
  );

  protected async handle(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    const replyMessage = await interaction.editReply({
      content: INSTRUCTIONS,
      components: [
        createBlacklistChannelsSelectRow(getBlacklistChannelIds(settings)),
      ],
    });

    const collector = replyMessage.createMessageComponentCollector({
      filter: isSameUserFilter(interaction.user),
      time: 300000, // 5 minutes timeout
    });

    // a rejection escaping this listener would hit the process-level
    // unhandledRejection handler in main.ts and take the bot down
    collector.on('collect', async (i) => {
      try {
        if (
          i.customId !== BLACKLIST_CHANNELS_SELECT_ID ||
          !i.isChannelSelectMenu()
        ) {
          return;
        }

        await i.deferUpdate();

        const blacklistChannelIds = i.values;

        await this.settingsCollection.upsert(interaction.guildId, {
          blacklistChannelIds,
        });

        const confirmation =
          blacklistChannelIds.length > 0
            ? `Saved! Blacklist notifications will be sent to: ${blacklistChannelIds
                .map(channelMention)
                .join(', ')}`
            : 'Saved! Blacklist notifications are now disabled.';

        await i.editReply({
          content: `${INSTRUCTIONS}\n\n${confirmation}`,
          components: [createBlacklistChannelsSelectRow(blacklistChannelIds)],
        });
      } catch (error) {
        this.logger.error('Failed to update blacklist channels', error);
        this.errorService.captureError(error);
      }
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({
          content:
            'This menu has expired. Run /settings blacklist-channels again if needed.',
          components: [],
        });
      } catch (error) {
        this.logger.error(
          'Failed to update expired blacklist channels menu',
          error,
        );
      }
    });
  }
}

export { EditBlacklistChannelsCommandHandler };
