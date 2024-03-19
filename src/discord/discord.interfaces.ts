export interface DiscordRequestOptions {
  guildId: string;
}

export interface DiscordChannelRequestOptions extends DiscordRequestOptions {
  channelId: string;
}

export interface DiscordUserRequestOptions extends DiscordRequestOptions {
  userId: string;
}
