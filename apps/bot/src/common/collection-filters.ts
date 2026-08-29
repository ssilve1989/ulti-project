import { type Interaction, User } from 'discord.js';

/**
 * Matches if the message component this is attached to is from the same user as the source interaction
 * @param i
 * @returns
 */
export const isSameUserFilter =
  (user: User) => (sourceInteraction: Interaction) =>
    user.id === sourceInteraction.user.id;
