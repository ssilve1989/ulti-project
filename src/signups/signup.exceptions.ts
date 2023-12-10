import { ButtonInteraction } from 'discord.js';

export class UnhandledButtonInteractionException extends Error {
  constructor(response: ButtonInteraction) {
    super(
      `Unknown message interaction received for signup confirmation: ${response.customId}}`,
    );
  }
}
