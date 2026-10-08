import type { ParticipantDocument } from '../../firebase/models/event.model.js';

/** A member withdrew from an event; `participant` is as it was before deletion, claim included. */
export class ParticipantWithdrawnEvent {
  constructor(
    public readonly eventId: string,
    public readonly participant: ParticipantDocument & { id: string },
  ) {}
}
