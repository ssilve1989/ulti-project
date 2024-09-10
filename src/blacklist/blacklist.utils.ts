import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import type { BlacklistDocument } from '../firebase/models/blacklist.model.js';

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

export function getDisplayName({
  characterName,
  discordId,
}: Pick<BlacklistDocument, 'characterName' | 'discordId'>): string {
  if (discordId) {
    return `<@${discordId}>`;
  }

  return characterName!;
}
