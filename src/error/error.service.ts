import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import {
  type ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
} from 'discord.js';
import { getErrorMessage } from '../common/error-guards.js';

@Injectable()
export class ErrorService {
  private readonly logger = new Logger(ErrorService.name);

  /**
   * Handles command errors with consistent logging, Sentry reporting, and user response
   * @param error - The error that occurred
   * @param interaction - Discord interaction for user response
   * @param userMessage - Optional custom user-friendly message
   * @returns Formatted error embed for user response
   */
  handleCommandError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
    userMessage?: string,
  ): EmbedBuilder {
    // 1. Report to Sentry (relies on context already set throughout execution)
    Sentry.captureException(error);

    // 2. Log error with structured context
    this.logError(error, interaction);

    // 3. Create standardized user response
    return this.createErrorEmbed(userMessage);
  }

  private logError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
  ): void {
    const errorMessage = getErrorMessage(error);

    this.logger.error(`Command error: ${errorMessage}`, {
      commandName: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
  }

  private createErrorEmbed(customMessage?: string): EmbedBuilder {
    const userMessage =
      customMessage || 'An unexpected error occurred. Please try again later.';

    return new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('Command Error')
      .setDescription(userMessage)
      .setTimestamp();
  }
}
