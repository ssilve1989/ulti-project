import {
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
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

type CACHE_TIME_UNIT = 'days' | 'hours' | 'minutes' | 'seconds';

/**
 *  converts a value to seconds based on the given unit
 * @param value
 * @param unit
 * @returns
 */
export function CacheTime(value: number, unit: CACHE_TIME_UNIT) {
  return match(unit)
    .with('seconds', () => value * CACHE_TIME_VALUES.SECOND)
    .with('minutes', () => value * CACHE_TIME_VALUES.MINUTE)
    .with('hours', () => value * CACHE_TIME_VALUES.HOUR)
    .with('days', () => value * CACHE_TIME_VALUES.DAY)
    .exhaustive();
}
