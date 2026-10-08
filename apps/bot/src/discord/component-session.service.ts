import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Message,
  MessageComponentInteraction,
} from 'discord.js';
import { isSameUserFilter } from '../common/collection-filters.js';
import { ErrorService } from '../error/error.service.js';

const COMPONENT_SESSION_TIMEOUT_MS = 5 * 60_000;

interface ComponentSessionOptions {
  /**
   * Which menu this is (e.g. `search`), tagged on its Sentry reports as
   * `component_session` and prefixed to its log lines
   */
  name: string;
  /** Shown, with the components removed, once the session times out */
  expiredContent: string;
  /** Also remove the embeds on timeout, for menus whose embed is only a draft */
  clearEmbedsOnExpiry?: boolean;
  /** Called once the session times out, before `expiredContent` is shown */
  onExpired?: () => void;
  onCollect: (i: MessageComponentInteraction<'cached'>) => Promise<void>;
}

@Injectable()
export class ComponentSessionService {
  constructor(private readonly errorService: ErrorService) {}

  /**
   * Handles the invoking user's clicks on `message`'s components for five
   * minutes, then replaces the reply with `expiredContent`. Returns a function
   * that ends the session early, once it's done, so it never expires.
   */
  run(
    interaction:
      | ChatInputCommandInteraction<'cached'>
      | ButtonInteraction<'cached'>,
    message: Message<true>,
    {
      name,
      expiredContent,
      clearEmbedsOnExpiry = false,
      onExpired,
      onCollect,
    }: ComponentSessionOptions,
  ): () => void {
    const collector = message.createMessageComponentCollector({
      filter: isSameUserFilter(interaction.user),
      time: COMPONENT_SESSION_TIMEOUT_MS,
    });

    // Clicks reach the collector through the client's InteractionCreate emit,
    // outside the command's Sentry scopes, so its listeners re-enter them:
    // their reports carry the command's user, tags and trace. These are the
    // command's own scopes, not copies, so a listener adds to a report only in
    // a nested Sentry.withScope, as `report` does, or every later report from
    // this session would carry it.
    const isolationScope = Sentry.getIsolationScope();
    const commandScope = Sentry.getCurrentScope();
    const inCommandScope = <T>(callback: () => T): T =>
      Sentry.withIsolationScope(isolationScope, () =>
        Sentry.withScope(commandScope, callback),
      );

    const report = (error: unknown, failure: string) => {
      Sentry.withScope((scope) => {
        scope.setTag('component_session', name);
        this.errorService.captureError(error, {
          message: `${name} menu: ${failure}`,
        });
      });
    };

    // a rejection escaping these listeners would hit the process-level
    // unhandledRejection handler in main.ts and take the bot down
    collector.on('collect', (i) =>
      inCommandScope(async () => {
        try {
          await onCollect(i);
        } catch (error) {
          report(error, 'failed to handle a click');
        }
      }),
    );

    collector.on('end', (_collected, reason) =>
      inCommandScope(async () => {
        // it also ends when its message, channel or guild is deleted, and
        // then there's nothing left to edit
        if (reason !== 'time') return;

        try {
          onExpired?.();
          await interaction.editReply({
            content: expiredContent,
            ...(clearEmbedsOnExpiry && { embeds: [] }),
            components: [],
          });
        } catch (error) {
          report(error, 'failed to mark it expired');
        }
      }),
    );

    return () => collector.stop('done');
  }
}
