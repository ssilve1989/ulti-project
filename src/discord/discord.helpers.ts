import {
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  User,
} from 'discord.js';
import { match } from 'ts-pattern';
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
type SafeReplyOptions = Pick<
  InteractionReplyOptions,
  'content' | 'embeds' | 'components' | 'files' | 'allowedMentions'
>;

/**
 * safely replies to an interaction based on its state
 * @param interaction
 * @param payload
 * @returns
 */
export function safeReply(
  interaction: ChatInputCommandInteraction,
  payload: string | SafeReplyOptions,
) {
  if (interaction.deferred) {
    return interaction.editReply(payload);
  }

  if (interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}
