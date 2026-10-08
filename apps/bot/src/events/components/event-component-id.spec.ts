import { describe, expect, it } from 'vitest';
import {
  eventComponentId,
  parseEventComponentId,
} from './event-component-id.js';

describe('an event button id', () => {
  it('is event, the action and the event id', () => {
    expect(eventComponentId('signup', 'event-1')).toEqual(
      'event:signup:event-1',
    );
  });

  it.each(['signup', 'withdraw'] as const)(
    'reads back the %s action and the event id',
    (action) => {
      expect(
        parseEventComponentId(eventComponentId(action, 'event-1')),
      ).toEqual({ action, eventId: 'event-1' });
    },
  );
});

describe('an id that is not an event button', () => {
  it.each(['event:', 'event:signup:', 'event:other:x', 'search:x'])(
    'reads %s as nothing',
    (customId) => {
      expect(parseEventComponentId(customId)).toBeUndefined();
    },
  );
});
