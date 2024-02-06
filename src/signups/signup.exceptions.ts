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

export class InvalidReviewChannelException extends Error {
  constructor(channelName: string, guildId: string) {
    super(`${channelName} is not a valid text channel for guild ${guildId}`);
  }
}

export class DocumentNotFoundException extends Error {
  constructor(message: string) {
    super(message);
  }
}
