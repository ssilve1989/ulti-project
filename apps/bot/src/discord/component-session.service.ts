import { Injectable, Logger } from '@nestjs/common';
import type {
  ChatInputCommandInteraction,
  Message,
  MessageComponentInteraction,
} from 'discord.js';
import { isSameUserFilter } from '../common/collection-filters.js';
import { ErrorService } from '../error/error.service.js';

const COMPONENT_SESSION_TIMEOUT_MS = 5 * 60_000;

interface ComponentSessionOptions {
  /** Log context for a click that `onCollect` failed to handle */
  errorMessage: string;
  /** Shown, with the components removed, once the session ends */
  expiredContent: string;
  onCollect: (i: MessageComponentInteraction<'cached'>) => Promise<void>;
}

@Injectable()
export class ComponentSessionService {
  private readonly logger = new Logger(ComponentSessionService.name);

  constructor(private readonly errorService: ErrorService) {}

  /**
   * Handles the invoking user's clicks on `message`'s components for five
   * minutes, then replaces the reply with `expiredContent`.
   */
  run(
    interaction: ChatInputCommandInteraction<'cached'>,
    message: Message<true>,
    { errorMessage, expiredContent, onCollect }: ComponentSessionOptions,
  ): void {
    const collector = message.createMessageComponentCollector({
      filter: isSameUserFilter(interaction.user),
      time: COMPONENT_SESSION_TIMEOUT_MS,
    });

    // a rejection escaping this listener would hit the process-level
    // unhandledRejection handler in main.ts and take the bot down
    collector.on('collect', async (i) => {
      try {
        await onCollect(i);
      } catch (error) {
        this.errorService.captureError(error, { message: errorMessage });
      }
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({
          content: expiredContent,
          components: [],
        });
      } catch (error) {
        this.logger.error(
          error,
          `Failed to update expired message: ${expiredContent}`,
        );
      }
    });
  }
}
