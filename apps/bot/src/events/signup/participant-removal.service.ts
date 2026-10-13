import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import type { ParticipantDocument } from '../../firebase/models/event.model.js';
import { EventChangesBus } from '../event-changes.bus.js';
import { ParticipantWithdrawnEvent } from './events.events.js';

@Injectable()
export class ParticipantRemovalService {
  constructor(
    private readonly events: EventsCollection,
    private readonly changes: EventChangesBus,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Removes the participant, telling the board and a claiming squad's
   * moderators. Undefined if they were already gone.
   */
  async remove(
    eventId: string,
    participantId: string,
    reason: ParticipantWithdrawnEvent['reason'],
  ): Promise<ParticipantDocument | undefined> {
    const outcome = await this.events.removeParticipant(eventId, participantId);
    if (!outcome) return undefined;
    const { removed, rosterChanged } = outcome;
    this.changes.publish({ kind: 'participant', eventId, participantId });
    if (rosterChanged && removed.claim) {
      this.changes.publish({
        kind: 'roster',
        eventId,
        encounter: removed.encounter,
        squadId: removed.claim.squadId,
      });
    }
    this.eventBus.publish(
      new ParticipantWithdrawnEvent(
        eventId,
        { ...removed, id: participantId },
        reason,
      ),
    );
    return removed;
  }
}
