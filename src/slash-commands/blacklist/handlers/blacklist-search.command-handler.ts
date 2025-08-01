import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { EmbedBuilder } from 'discord.js';
import { getMessageLink } from '../../../discord/discord.consts.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { BlacklistCollection } from '../../../firebase/collections/blacklist-collection.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import type { BlacklistDocument } from '../../../firebase/models/blacklist.model.js';
import type { SignupDocument } from '../../../firebase/models/signup.model.js';
import { BlacklistSearchCommand } from '../blacklist.commands.js';
import { createBlacklistEmbedFields } from '../blacklist.utils.js';

@CommandHandler(BlacklistSearchCommand)
class BlacklistSearchCommandHandler
  implements ICommandHandler<BlacklistSearchCommand>
{
  private readonly logger = new Logger(BlacklistSearchCommandHandler.name);
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly blacklistCollection: BlacklistCollection,
    private readonly discordService: DiscordService,
  ) {}

  async execute({ signup, guildId }: BlacklistSearchCommand) {
    const settings = await this.settingsCollection.getSettings(guildId);
    if (!settings?.autoModChannelId) {
      this.logger.warn(`No auto-mod channel set for guild ${guildId}`);
      return;
    }

    const { autoModChannelId, reviewChannel } = settings;

    // search to see if the signup is in the blacklist
    const match = await this.blacklistCollection.search({
      guildId,
      discordId: signup.discordId,
      characterName: signup.character,
    });

    if (!match) return;

    const channel = await this.discordService.getTextChannel({
      guildId,
      channelId: autoModChannelId,
    });

    const embed = await this.createBlacklistEmbed(match, signup, {
      guildId,
      reviewChannelId: reviewChannel,
    });

    return await channel?.send({ embeds: [embed] });
  }

  private async createBlacklistEmbed(
    entry: BlacklistDocument,
    { reviewMessageId }: Pick<SignupDocument, 'reviewMessageId'>,
    { guildId, reviewChannelId }: { guildId: string; reviewChannelId?: string },
  ) {
    const fields = await createBlacklistEmbedFields(
      this.discordService,
      entry,
      guildId,
    );

    if (reviewMessageId && reviewChannelId) {
      fields.push({
        name: 'Signup',
        value: getMessageLink({
          guildId,
          channelId: reviewChannelId,
          id: reviewMessageId,
        }),
        inline: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('Blacklisted User Detected')
      .setDescription('A blacklisted user has been detected signing up')
      .addFields(fields)
      .setTimestamp();

    return embed;
  }
}

export { BlacklistSearchCommandHandler };
