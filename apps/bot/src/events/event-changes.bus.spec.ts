import { describe, expect, it } from 'vitest';
import { type EventChange, EventChangesBus } from './event-changes.bus.js';

describe('EventChangesBus', () => {
  it("delivers only the event's changes, in order", () => {
    const bus = new EventChangesBus();
    const seen: EventChange[] = [];
    const subscription = bus.changes('a').subscribe((change) => {
      seen.push(change);
    });

    bus.publish({ kind: 'event', eventId: 'a' });
    bus.publish({ kind: 'participant', eventId: 'b', participantId: 'p1' });
    bus.publish({ kind: 'participant', eventId: 'a', participantId: 'p2' });
    subscription.unsubscribe();

    expect(seen).toEqual([
      { kind: 'event', eventId: 'a' },
      { kind: 'participant', eventId: 'a', participantId: 'p2' },
    ]);
  });

  it('delivers nothing published before the subscription', () => {
    const bus = new EventChangesBus();
    bus.publish({ kind: 'event', eventId: 'a' });
    const seen: EventChange[] = [];

    const subscription = bus.changes('a').subscribe((change) => {
      seen.push(change);
    });
    subscription.unsubscribe();

    expect(seen).toEqual([]);
  });
});
