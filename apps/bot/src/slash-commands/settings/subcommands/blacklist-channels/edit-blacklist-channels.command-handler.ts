import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { channelMention, MessageFlags } from 'discord.js';
import { runComponentSession } from '../../../../discord/discord.helpers.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { getBlacklistChannelIds } from '../../../../firebase/models/settings.model.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
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
class EditBlacklistChannelsCommandHandler implements ISlashCommand {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    const replyMessage = await interaction.editReply({
      content: INSTRUCTIONS,
      components: [
        createBlacklistChannelsSelectRow(getBlacklistChannelIds(settings)),
      ],
    });

    runComponentSession(interaction, replyMessage, {
      errorService: this.errorService,
      errorMessage: 'Failed to update blacklist channels',
      expiredContent:
        'This menu has expired. Run /settings blacklist-channels again if needed.',
      onCollect: async (i) => {
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
      },
    });
  }
}

export { EditBlacklistChannelsCommandHandler };
