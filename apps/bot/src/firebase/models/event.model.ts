import type { EventDocument } from '@ulti-project/shared';

export {
  type EventDocument,
  type EventPhase,
  EventStatus,
  type NewParticipant,
  type ParticipantDocument,
} from '@ulti-project/shared';

export type NewEvent = Omit<
  EventDocument,
  'status' | 'signupsCloseDueAt' | 'messageId'
>;

export type StoredEvent = EventDocument & { id: string };
