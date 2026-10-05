import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import {
  type ChatInputCommandInteraction,
  DiscordjsErrorCodes,
  type Embed,
  type InteractionReplyOptions,
  type Message,
  type MessageComponentInteraction,
  MessageFlags,
  MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  User,
} from 'discord.js';
import { match } from 'ts-pattern';
import { isSameUserFilter } from '../common/collection-filters.js';
import type { ErrorService } from '../error/error.service.js';
import { CACHE_TIME_VALUES } from './discord.consts.js';

export function hydrateReaction(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<MessageReaction> {
  return reaction.partial ? reaction.fetch() : Promise.resolve(reaction);
}

export function hydrateUser(user: User | PartialUser): Promise<User> {
  return user.partial ? user.fetch() : Promise.resolve(user);
}

type CacheTimeUnit = 'days' | 'hours' | 'minutes' | 'seconds';

/**
 *  converts a value to seconds based on the given unit
 * @param value
 * @param unit
 * @returns
 */
export function CacheTime(value: number, unit: CacheTimeUnit) {
  return match(unit)
    .with('seconds', () => value * CACHE_TIME_VALUES.SECOND)
    .with('minutes', () => value * CACHE_TIME_VALUES.MINUTE)
    .with('hours', () => value * CACHE_TIME_VALUES.HOUR)
    .with('days', () => value * CACHE_TIME_VALUES.DAY)
    .exhaustive();
}

// Type that works safely with reply(), editReply(), and followUp()
type PrivateReplyOptions = Pick<
  InteractionReplyOptions,
  'content' | 'embeds' | 'components' | 'files' | 'allowedMentions'
>;

export function getFirstEmbed(message: Message): Embed {
  const embed = message.embeds.at(0);
  if (!embed) throw new Error(`Expected embed on message ${message.id}`);
  return embed;
}

/**
 * privately replies to an interaction based on its state. A deferred reply is
 * edited, so it stays as private as it was deferred (every command defers
 * ephemerally).
 */
export function replyPrivately(
  interaction: ChatInputCommandInteraction,
  payload: PrivateReplyOptions,
) {
  if (interaction.deferred) {
    return interaction.editReply(payload);
  }

  if (interaction.replied) {
    return interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
  }

  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

/** the error discord.js rejects with when a collector ends without the interaction it waited for */
export const isCollectorTimeout = (error: unknown) =>
  error instanceof Error &&
  'code' in error &&
  error.code === DiscordjsErrorCodes.InteractionCollectorError;

/**
 * Records that the user let `interaction`'s prompt expire: a
 * `discord.prompt.expired` count, and a Sentry log line, which carries the user
 * from the command's scope. It isn't an error, so it raises no Sentry issue.
 */
export function recordExpiredPrompt(
  interaction: ChatInputCommandInteraction,
): void {
  const subcommand = interaction.options.getSubcommand(false);
  // Sentry logs keep an `undefined` attribute, as an empty string
  const attributes = {
    command: interaction.commandName,
    ...(subcommand && { subcommand }),
  };

  Sentry.metrics.count('discord.prompt.expired', 1, { attributes });
  Sentry.logger.info('Prompt expired before the user answered', attributes);
}

const COMPONENT_SESSION_TIMEOUT_MS = 5 * 60_000;

const componentSessionLogger = new Logger('ComponentSession');

interface ComponentSessionOptions {
  errorService: ErrorService;
  /** Log context for a click that `onCollect` failed to handle */
  errorMessage: string;
  /** Shown, with the components removed, once the session ends */
  expiredContent: string;
  onCollect: (i: MessageComponentInteraction<'cached'>) => Promise<void>;
}

/**
 * Handles the invoking user's clicks on `message`'s components for five
 * minutes, then replaces the reply with `expiredContent`.
 */
export function runComponentSession(
  interaction: ChatInputCommandInteraction<'cached'>,
  message: Message<true>,
  {
    errorService,
    errorMessage,
    expiredContent,
    onCollect,
  }: ComponentSessionOptions,
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
      errorService.captureError(error, { message: errorMessage });
    }
  });

  collector.on('end', async () => {
    try {
      await interaction.editReply({ content: expiredContent, components: [] });
    } catch (error) {
      componentSessionLogger.error(
        error,
        `Failed to update expired message: ${expiredContent}`,
      );
    }
  });
}
