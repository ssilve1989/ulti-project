import {
  type BoardEvent,
  type BoardEventSummary,
  Encounter,
  Job,
} from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect, vi } from 'vitest';
import { boardConfig } from '../../config/board.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import {
  type EventDocument,
  EventStatus,
  type ParticipantDocument,
} from '../../firebase/models/event.model.js';
import {
  type DiscordAccount,
  signInAs,
} from '../../test-utils/discord-oauth.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type HttpFlowApp } from '../../test-utils/flow-app.js';

const GUILD = boardConfig.BOARD_GUILD_ID;
const OTHER_GUILD = 'other-guild';
const VIEWER_ROLE = 'role-viewer';
const FROGS_ROLE = 'role-frogs';
const NOW = new Date('2026-10-08T12:00:00Z');

const ALICE: DiscordAccount = Object.freeze({
  id: '111111111111111111',
  username: 'alice',
  globalName: 'Alice',
});
const BOB = Object.freeze({
  id: '222222222222222222',
  username: 'bob',
  nickname: 'Bob (main tank)',
});
/** Signed up, then left the guild. */
const CAROL_ID = '333333333333333333';

const FROGS = Object.freeze({
  id: 'frg',
  name: 'Frogs',
  tag: 'FRG',
  color: '#16a34a',
});

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

/** An event's document in the board guild; `open` and due to close sign-ups unless overridden. */
function anEvent(overrides: Partial<EventDocument>): EventDocument {
  return {
    guildId: GUILD,
    title: 'FRU prog night',
    startsAt: at('2026-10-12T20:00:00Z'),
    signupsCloseAt: at('2026-10-12T18:00:00Z'),
    signupsCloseDueAt: at('2026-10-12T18:00:00Z'),
    encounters: [Encounter.FRU],
    channelId: 'events-channel',
    createdBy: ALICE.id,
    status: EventStatus.Open,
    ...overrides,
  };
}

const ROSTER_EVENT_ID = 'roster-night';
const ROSTER_EVENT = Object.freeze(
  anEvent({
    title: 'FRU + TOP prog night',
    encounters: [Encounter.FRU, Encounter.TOP],
  }),
);

/** Its sign-ups have closed, so it's no longer due to close them; it starts before the roster night. */
const CLOSED_SIGNUPS_EVENT_ID = 'closed-signups-night';
const CLOSED_SIGNUPS_EVENT: EventDocument = Object.freeze({
  guildId: GUILD,
  title: 'TOP reclear',
  startsAt: at('2026-10-09T20:00:00Z'),
  signupsCloseAt: at('2026-10-08T10:00:00Z'),
  encounters: [Encounter.TOP],
  channelId: 'events-channel',
  createdBy: ALICE.id,
  status: EventStatus.SignupsClosed,
});

const BOB_FRU: ParticipantDocument = Object.freeze<ParticipantDocument>({
  discordId: BOB.id,
  encounter: Encounter.FRU,
  job: Job.WAR,
  character: 'bob bobson',
  world: 'jenova',
  phase: { roleId: 'fru-p4', label: 'P4', order: 4, bucket: 'prog' },
  signedUpAt: at('2026-10-07T12:00:00Z'),
  claim: {
    squadId: FROGS.id,
    claimedBy: ALICE.id,
    claimedAt: at('2026-10-08T09:30:00Z'),
  },
});

const CAROL_TOP: ParticipantDocument = Object.freeze<ParticipantDocument>({
  discordId: CAROL_ID,
  encounter: Encounter.TOP,
  job: Job.SGE,
  character: 'carol carolson',
  world: 'gilgamesh',
  phase: { roleId: 'top-clear', label: 'Cleared', order: 9, bucket: 'clear' },
  signedUpAt: at('2026-10-07T13:00:00Z'),
});

function seedParticipant(
  flow: HttpFlowApp,
  eventId: string,
  participant: ParticipantDocument,
): void {
  const id = EventsCollection.participantId(
    participant.discordId,
    participant.encounter,
  );
  flow.db.seed(`events/${eventId}/participants/${id}`, participant);
}

/**
 * Boots the board at NOW with a viewer role and a squad, Bob in the guild,
 * and the guild's events: the roster night (Bob, claimed by the Frogs, and
 * Carol, who has since left), a TOP night whose sign-ups have closed, a
 * closed event, and another guild's event.
 */
async function startFlow(): Promise<HttpFlowApp> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    const flow = await createFlowApp({ http: true });
    flow.discord.addRole(GUILD, { id: VIEWER_ROLE, name: 'Viewer' });
    flow.discord.addRole(GUILD, { id: FROGS_ROLE, name: 'Frogs' });
    flow.discord.addMember({
      id: BOB.id,
      username: BOB.username,
      displayName: BOB.nickname,
    });
    flow.db.seed(`settings/${GUILD}`, {
      boardViewerRoles: [VIEWER_ROLE],
      squads: {
        frg: {
          name: 'Frogs',
          tag: 'FRG',
          color: '#16a34a',
          roleId: FROGS_ROLE,
        },
      },
    });
    flow.db.seed(`encounters/${Encounter.FRU}`, {
      name: 'FRU',
      description: 'Futures Rewritten',
      active: true,
      progPartyThreshold: 'P3',
      clearPartyThreshold: 'P5',
    });
    flow.db.seed(`encounters/${Encounter.TOP}`, {
      name: 'TOP',
      description: 'The Omega Protocol',
      active: true,
    });

    flow.db.seed(`events/${ROSTER_EVENT_ID}`, ROSTER_EVENT);
    seedParticipant(flow, ROSTER_EVENT_ID, BOB_FRU);
    seedParticipant(flow, ROSTER_EVENT_ID, CAROL_TOP);
    flow.db.seed(`events/${CLOSED_SIGNUPS_EVENT_ID}`, CLOSED_SIGNUPS_EVENT);
    seedParticipant(flow, CLOSED_SIGNUPS_EVENT_ID, {
      ...CAROL_TOP,
      discordId: BOB.id,
    });
    flow.db.seed('events/closed-night', {
      ...CLOSED_SIGNUPS_EVENT,
      status: EventStatus.Closed,
    });
    flow.db.seed('events/other-guild-night', anEvent({ guildId: OTHER_GUILD }));
    return flow;
  } catch (error) {
    vi.useRealTimers();
    throw error;
  }
}

async function stopFlow(flow: HttpFlowApp): Promise<void> {
  try {
    await flow.close();
  } finally {
    vi.useRealTimers();
  }
}

const it = base.extend<{ flow: HttpFlowApp }>({
  flow: fresh(startFlow, stopFlow),
});

/** Alice, a viewer, signs in. */
async function signInAViewer(flow: HttpFlowApp): Promise<void> {
  flow.discord.addMember({
    id: ALICE.id,
    username: ALICE.username,
    globalName: ALICE.globalName,
    roles: [VIEWER_ROLE],
  });
  await signInAs(flow, ALICE);
}

async function get(flow: HttpFlowApp, path: string) {
  const { status, body } = await flow.http.get(path);
  return { status, body };
}

const NOT_FOUND = Object.freeze({ status: 404, body: { reason: 'not-found' } });

describe('when someone who is not signed in reads the board', () => {
  it('answers the event list 401 signed-out', async ({ flow }) => {
    await expect(get(flow, '/api/events')).resolves.toEqual({
      status: 401,
      body: { reason: 'signed-out' },
    });
  });

  it('answers an event 401 signed-out', async ({ flow }) => {
    await expect(get(flow, `/api/events/${ROSTER_EVENT_ID}`)).resolves.toEqual({
      status: 401,
      body: { reason: 'signed-out' },
    });
  });
});

describe('when a viewer lists the events', () => {
  it.beforeEach(({ flow }) => signInAViewer(flow));

  it("lists the guild's events that aren't closed, earliest first", async ({
    flow,
  }) => {
    const events: BoardEventSummary[] = [
      {
        id: CLOSED_SIGNUPS_EVENT_ID,
        title: 'TOP reclear',
        startsAt: '2026-10-09T20:00:00.000Z',
        encounters: [Encounter.TOP],
        participantCount: 1,
      },
      {
        id: ROSTER_EVENT_ID,
        title: 'FRU + TOP prog night',
        startsAt: '2026-10-12T20:00:00.000Z',
        encounters: [Encounter.FRU, Encounter.TOP],
        participantCount: 2,
      },
    ];

    await expect(get(flow, '/api/events')).resolves.toEqual({
      status: 200,
      body: events,
    });
  });
});

describe('when a viewer opens an event', () => {
  it.beforeEach(({ flow }) => signInAViewer(flow));

  it('shows its roster by guild name, with claims, phases and squads', async ({
    flow,
  }) => {
    const event: BoardEvent = {
      id: ROSTER_EVENT_ID,
      title: 'FRU + TOP prog night',
      startsAt: '2026-10-12T20:00:00.000Z',
      signupsCloseAt: '2026-10-12T18:00:00.000Z',
      status: 'open',
      encounters: [
        {
          id: Encounter.FRU,
          name: '[FRU] Futures Rewritten',
          progPartyThreshold: 'P3',
          clearPartyThreshold: 'P5',
        },
        { id: Encounter.TOP, name: '[TOP] The Omega Protocol' },
      ],
      participants: [
        {
          id: `${BOB.id}-FRU`,
          encounter: Encounter.FRU,
          discordId: BOB.id,
          displayName: BOB.nickname,
          character: 'bob bobson',
          world: 'jenova',
          job: Job.WAR,
          jobRole: 'tank',
          phase: { label: 'P4', order: 4, bucket: 'prog' },
          claim: {
            squadId: FROGS.id,
            claimedBy: ALICE.id,
            claimedAt: '2026-10-08T09:30:00.000Z',
          },
        },
        {
          id: `${CAROL_ID}-TOP`,
          encounter: Encounter.TOP,
          discordId: CAROL_ID,
          // she has left the guild, so she's named by her character
          displayName: 'Carol Carolson',
          character: 'carol carolson',
          world: 'gilgamesh',
          job: Job.SGE,
          jobRole: 'healer',
          phase: { label: 'Cleared', order: 9, bucket: 'clear' },
          claim: null,
        },
      ],
      squads: [FROGS],
    };

    await expect(get(flow, `/api/events/${ROSTER_EVENT_ID}`)).resolves.toEqual({
      status: 200,
      body: event,
    });
  });

  it("answers another guild's event 404 not-found", async ({ flow }) => {
    await expect(get(flow, '/api/events/other-guild-night')).resolves.toEqual(
      NOT_FOUND,
    );
  });

  it('answers an unknown event 404 not-found', async ({ flow }) => {
    await expect(get(flow, '/api/events/no-such-night')).resolves.toEqual(
      NOT_FOUND,
    );
  });

  it('answers an id that is not a document id 404 not-found', async ({
    flow,
  }) => {
    await expect(get(flow, '/api/events/roster%2Fnight')).resolves.toEqual(
      NOT_FOUND,
    );
  });
});
