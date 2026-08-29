import type { User } from 'discord.js';
import type { BlacklistDocument } from '../../../firebase/models/blacklist.model.js';

type BlacklistUpdateEventData = {
  guildId: string;
  entry: BlacklistDocument;
  type: 'added' | 'removed';
  triggeredBy: User;
};

export class BlacklistUpdatedEvent {
  constructor(public readonly data: BlacklistUpdateEventData) {}
}
