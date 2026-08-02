import { ActivityType } from 'discord.js';

export interface StatusMessage {
  type: ActivityType;
  name: string;
}

type StatusCategory = 'purpose' | 'insideJokes';

export const STATUS_CATEGORIES: Record<StatusCategory, StatusMessage[]> = {
  purpose: [
    { type: ActivityType.Watching, name: 'over signup reviews' },
    { type: ActivityType.Listening, name: 'to slash commands!' },
    { type: ActivityType.Watching, name: 'the FFLogs roll in' },
    { type: ActivityType.Playing, name: 'matchmaker for prog parties' },
  ],
  // TODO: replace these with real ulti-project / sausfest inside jokes
  insideJokes: [
    { type: ActivityType.Playing, name: "Tickling Saus's balls" },
    { type: ActivityType.Playing, name: 'hide and seek with Saus' },
    { type: ActivityType.Watching, name: 'Saus rage at a wipe' },
  ],
};

/**
 * Picks a status message at random. Each category is weighted equally
 * regardless of how many messages it contains, then a message is picked
 * at random within that category.
 */
export function pickRandomStatus(): StatusMessage {
  const categories = Object.values(STATUS_CATEGORIES);
  const category = categories[Math.floor(Math.random() * categories.length)];
  return category[Math.floor(Math.random() * category.length)];
}
