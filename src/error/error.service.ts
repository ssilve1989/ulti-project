import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import {
  type ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
} from 'discord.js';
import { getErrorMessage } from '../common/error-guards.js';

interface ErrorHandlingOptions {
  log?: boolean;
  capture?: boolean;
  message?: string;
}

@Injectable()
export class ErrorService {
  private readonly logger = new Logger(ErrorService.name);

  /**
   * Handles command errors with consistent logging, Sentry reporting, and user response
   * @param error - The error that occurred
   * @param interaction - Discord interaction for user response
   * @param options - Options for error handling and user message
   * @returns Formatted error embed for user response
   */
  handleCommandError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
    options?: ErrorHandlingOptions,
  ): EmbedBuilder {
    this.processError(error, options);

    // Additional interaction-specific logging with Discord context
    if (options?.log ?? true) {
      this.logInteractionError(error, interaction);
    }

    return this.createErrorEmbed(options?.message);
  }

  /**
   * Captures errors for non-interaction contexts (background jobs, utilities, etc.)
   * @param error - The error that occurred
   * @param options - Options for logging and Sentry reporting
   */
  captureError(error: unknown, options?: ErrorHandlingOptions): void {
    this.processError(error, options);
  }

  /**
   * Shared error processing logic for Sentry reporting and basic logging
   */
  private processError(error: unknown, options?: ErrorHandlingOptions): void {
    if (options?.capture ?? true) {
      Sentry.captureException(error);
    }

    if (options?.log ?? true) {
      this.logErrorWithoutInteraction(error);
    }
  }

  private logInteractionError(
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

  private logErrorWithoutInteraction(error: unknown, message?: string): void {
    const errorMessage = message ?? getErrorMessage(error);
    this.logger.error(`Error: ${errorMessage}`);
  }

  private createErrorEmbed(message?: string): EmbedBuilder {
    const userMessage =
      message || 'An unexpected error occurred. Please try again later.';

    return new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('Command Error')
      .setDescription(userMessage)
      .setTimestamp();
  }
}
