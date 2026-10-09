import { HttpStatus } from '@nestjs/common';
import {
  type BoardEvent,
  type BoardParticipant,
  type BoardStreamMessage,
  Encounter,
  Job,
} from '@ulti-project/shared';
import { describe, expect, it, onTestFinished } from 'vitest';
import { EventChangesBus } from '../../events/event-changes.bus.js';
import { BoardHttpError } from '../../http/http-exception.filter.js';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import type { BoardEventReader } from './board-event.reader.js';
import { EventStreamService } from './event-stream.service.js';

const GUILD = 'guild-1';
const EVENT_ID = 'roster-night';

const SNAPSHOT: BoardEvent = Object.freeze({
  id: EVENT_ID,
  title: 'FRU prog night',
  startsAt: '2026-10-12T20:00:00.000Z',
  signupsCloseAt: '2026-10-12T18:00:00.000Z',
  status: 'open',
  encounters: [{ id: Encounter.FRU, name: '[FRU] Futures Rewritten' }],
  participants: [],
  squads: [],
});

const participant = (discordId: string): BoardParticipant => ({
  id: `${discordId}-${Encounter.FRU}`,
  encounter: Encounter.FRU,
  discordId,
  displayName: discordId,
  character: 'bob bobson',
  world: 'jenova',
  job: Job.WAR,
  jobRole: 'tank',
  phase: { label: 'P4', order: 4, bucket: 'prog' },
  claim: null,
});
const BOB = participant('222222222222222222');
const CAROL = participant('333333333333333333');

/** A promise the test settles when it chooses. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Lets pending reads settle and their messages through. */
const flushed = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
  const bus = new EventChangesBus();
  const reader = createAutoMock<BoardEventReader>();
  const service = new EventStreamService(bus, reader);
  const messages: BoardStreamMessage[] = [];
  const errors: unknown[] = [];
  const open = () => {
    const subscription = service.stream(GUILD, EVENT_ID).subscribe({
      next: (message) => messages.push(message),
      error: (error: unknown) => errors.push(error),
    });
    onTestFinished(() => subscription.unsubscribe());
  };
  return { bus, reader, messages, errors, open };
}

describe('when a player changes while the snapshot is loading', () => {
  it('sends the change after the snapshot', async () => {
    const { bus, reader, messages, open } = setup();
    const snapshot = deferred<BoardEvent | undefined>();
    reader.get.mockReturnValueOnce(snapshot.promise);
    reader.participant.mockResolvedValue(BOB);
    open();

    bus.publish({
      kind: 'participant',
      eventId: EVENT_ID,
      participantId: BOB.id,
    });
    snapshot.resolve(SNAPSHOT);
    await flushed();

    expect(messages).toEqual([
      { type: 'snapshot', event: SNAPSHOT },
      { type: 'participant-upserted', participant: BOB },
    ]);
  });
});

describe('when an earlier change takes longer to read than a later one', () => {
  it('sends the changes in the order they happened', async () => {
    const { bus, reader, messages, open } = setup();
    reader.get.mockResolvedValue(SNAPSHOT);
    const bob = deferred<BoardParticipant | undefined>();
    reader.participant
      .mockReturnValueOnce(bob.promise)
      .mockResolvedValueOnce(CAROL);
    open();
    await flushed();

    bus.publish({
      kind: 'participant',
      eventId: EVENT_ID,
      participantId: BOB.id,
    });
    bus.publish({
      kind: 'participant',
      eventId: EVENT_ID,
      participantId: CAROL.id,
    });
    await flushed();
    bob.resolve(BOB);
    await flushed();

    expect(messages).toEqual([
      { type: 'snapshot', event: SNAPSHOT },
      { type: 'participant-upserted', participant: BOB },
      { type: 'participant-upserted', participant: CAROL },
    ]);
  });
});

describe('when the event is missing', () => {
  it('fails with 404 not-found before sending anything', async () => {
    const { reader, messages, errors, open } = setup();
    reader.get.mockResolvedValue(undefined);

    open();
    await flushed();

    expect({
      messages,
      errors: errors.map((error) =>
        error instanceof BoardHttpError
          ? { status: error.getStatus(), body: error.body }
          : error,
      ),
    }).toEqual({
      messages: [],
      errors: [{ status: HttpStatus.NOT_FOUND, body: { reason: 'not-found' } }],
    });
  });
});
