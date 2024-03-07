import {
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from 'discord.js';

export function hydrateReaction(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<MessageReaction> {
  return reaction.partial ? reaction.fetch() : Promise.resolve(reaction);
}

export function hydrateUser(user: User | PartialUser): Promise<User> {
  return user.partial ? user.fetch() : Promise.resolve(user);
}
