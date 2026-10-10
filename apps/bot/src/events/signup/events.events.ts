import type { ParticipantDocument } from '../../firebase/models/event.model.js';

/**
 * A member's sign-up was removed: they withdrew, an organizer removed its
 * encounter from the event's schedule, or a sync found them gone from
 * Raid-Helper. `participant` is as it was before deletion, claim included.
 */
export class ParticipantWithdrawnEvent {
  constructor(
    public readonly eventId: string,
    public readonly participant: ParticipantDocument & { id: string },
    public readonly reason:
      | 'withdrew'
      | 'encounter-removed'
      | 'left-raid-helper',
  ) {}
}
