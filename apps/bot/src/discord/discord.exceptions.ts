import { ButtonInteraction } from 'discord.js';

export class UnhandledButtonInteractionException extends Error {
  constructor(response: ButtonInteraction) {
    super(
      `Unknown message interaction received for signup confirmation: ${response.customId}}`,
    );
  }
}

export class MissingChannelException extends Error {
  constructor(channelId: string, guildId: string) {
    super(`No channel found with id ${channelId} for guild ${guildId}`);
  }
}
