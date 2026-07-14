import type { Logger } from '@nestjs/common';
import {
  type APIEmbedField,
  type CacheType,
  type ChatInputCommandInteraction,
  type EmbedBuilder,
  userMention,
} from 'discord.js';
import { titleCase } from 'title-case';
import type { DiscordService } from '../../discord/discord.service.js';
import type { BlacklistDocument } from '../../firebase/models/blacklist.model.js';

/**
 * Sends the embed to every configured blacklist notification channel.
 * A channel that fails to resolve or send must not block the others.
 */
export async function sendToBlacklistChannels(
  discordService: DiscordService,
  logger: Logger,
  {
    guildId,
    channelIds,
    embed,
  }: { guildId: string; channelIds: string[]; embed: EmbedBuilder },
): Promise<void> {
  await Promise.all(
    channelIds.map(async (channelId) => {
      try {
        const channel = await discordService.getTextChannel({
          guildId,
          channelId,
        });
        await channel?.send({ embeds: [embed] });
      } catch (error) {
        logger.error(
          `failed to send blacklist message to channel ${channelId} in guild ${guildId}`,
          error,
        );
      }
    }),
  );
}

export function getDiscordId(
  interaction: ChatInputCommandInteraction<CacheType>,
): string | null {
  const discordUser = interaction.options.getUser('user');
  const discordUserIdString = interaction.options.getString('discord-id');

  if (discordUser) {
    return discordUser.id;
  }

  return discordUserIdString;
}

export async function getDisplayName(
  discordService: DiscordService,
  {
    guildId,
    characterName,
    discordId,
  }: Pick<BlacklistDocument, 'characterName' | 'discordId'> & {
    guildId: string;
  },
): Promise<string> {
  const serverName =
    characterName ||
    (await discordService
      .getDisplayName({
        guildId,
        userId: discordId,
      })
      .catch(() => ''));

  return titleCase(`${serverName ?? ''} (${userMention(discordId)})`);
}

/**
 * deprecated
 * @param param0
 * @returns
 */
export async function createBlacklistEmbedFields(
  discordService: DiscordService,
  { reason, discordId, lodestoneId, characterName }: BlacklistDocument,
  guildId: string,
): Promise<APIEmbedField[]> {
  const displayName = await getDisplayName(discordService, {
    guildId,
    characterName,
    discordId,
  });

  return [
    { name: 'Player', value: displayName, inline: true },
    { name: 'Reason', value: reason, inline: true },
    lodestoneId
      ? { name: 'Lodestone ID', value: String(lodestoneId), inline: true }
      : { name: '\u200b', value: '\u200b', inline: true },
  ];
}
