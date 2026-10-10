import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import {
  type ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  type MessageComponentInteraction,
} from 'discord.js';
import { getErrorMessage } from '../common/error-guards.js';
import { replyPrivately } from '../discord/discord.helpers.js';

/** An interaction a user can be answered on: a slash command or a click on a message's component. */
type ReportableInteraction =
  | ChatInputCommandInteraction
  | MessageComponentInteraction;

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
    interaction: ReportableInteraction,
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
   * Reports an unexpected error from handling `interaction`, and tells the
   * user privately, clearing any buttons or menus it was still showing.
   */
  async replyWithError(
    error: unknown,
    interaction: ReportableInteraction,
  ): Promise<void> {
    const errorEmbed = this.handleCommandError(error, interaction);
    const payload = { embeds: [errorEmbed], components: [] };

    try {
      await replyPrivately(interaction, payload);
    } catch (replyError) {
      this.logger.error(
        {
          originalError: error,
          replyError,
        },
        'Failed to send error response',
      );
    }
  }

  /**
   * Captures errors for non-interaction contexts (background jobs, utilities, etc.)
   * @param error - The error that occurred
   * @param options - Options for logging and Sentry reporting
   */
  captureError(error: unknown, options?: ErrorHandlingOptions): void {
    // Here `message` is log context; in `handleCommandError` it is the
    // user-facing embed text, so only this path forwards it to the log.
    this.processError(error, options, options?.message);
  }

  /**
   * Shared error processing logic for Sentry reporting and basic logging
   */
  private processError(
    error: unknown,
    options?: ErrorHandlingOptions,
    logMessage?: string,
  ): void {
    if (options?.capture ?? true) {
      Sentry.getCurrentScope().captureException(error);
    }

    if (options?.log ?? true) {
      this.logErrorWithoutInteraction(error, logMessage);
    }
  }

  private logInteractionError(
    error: unknown,
    interaction: ReportableInteraction,
  ): void {
    const errorMessage = getErrorMessage(error);
    const source =
      'commandName' in interaction
        ? { commandName: interaction.commandName }
        : { customId: interaction.customId };

    this.logger.error(
      {
        ...source,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      },
      `Command error: ${errorMessage}`,
    );
  }

  private logErrorWithoutInteraction(error: unknown, message?: string): void {
    const errorMessage = message ?? getErrorMessage(error);
    // `error` is unknown (possibly a string), so wrap it under `err` for
    // pino's error serializer rather than passing it as the log object.
    this.logger.error({ err: error }, `Error: ${errorMessage}`);
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
