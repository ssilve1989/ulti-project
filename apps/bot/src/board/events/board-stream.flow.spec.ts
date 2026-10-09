import { setTimeout as sleep } from 'node:timers/promises';
import {
  type BoardEvent,
  type BoardParticipant,
  type BoardStreamMessage,
  Encounter,
  Job,
  PartyStatus,
  SignupStatus,
} from '@ulti-project/shared';
import { ComponentType } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import type { Agent } from 'supertest';
import { test as base, describe, expect, vi } from 'vitest';
import { USTimeZones } from '../../common/time-zones.js';
import { boardConfig } from '../../config/board.js';
import { EventChangesBus } from '../../events/event-changes.bus.js';
import { EventMessageService } from '../../events/event-message.service.js';
import type { Weekday } from '../../events/schedules/next-occurrence.js';
import {
  type EventDocument,
  EventStatus,
  type ParticipantDocument,
} from '../../firebase/models/event.model.js';
import type { EventScheduleDocument } from '../../firebase/models/event-schedule.model.js';
import {
  type DiscordAccount,
  signInAs,
} from '../../test-utils/discord-oauth.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type HttpFlowApp } from '../../test-utils/flow-app.js';
import { seedSignup } from '../../test-utils/signups.js';
import { type OpenStreams, openStreams } from '../../test-utils/sse.js';

const GUILD = boardConfig.BOARD_GUILD_ID;
const EVENTS_CHANNEL = 'events-channel';
const VIEWER_ROLE = 'role-viewer';
const FROGS_ROLE = 'role-frogs';
const ORGANIZER_ROLE = 'role-organizer';
const FRU_P4_ROLE = 'role-fru-p4';
const NOW = new Date('2026-10-08T12:00:00Z');

/** Watches the board. */
const ALICE: DiscordAccount = Object.freeze({
  id: '111111111111111111',
  username: 'alice',
  globalName: 'Alice',
});
/** Leads the Frogs, in another browser. */
const DAVE: DiscordAccount = Object.freeze({
  id: '444444444444444444',
  username: 'dave',
  globalName: 'Dave',
});
/** Signed up for the roster night. */
const BOB = Object.freeze({
  id: '222222222222222222',
  username: 'bob',
  nickname: 'Bob (main tank)',
});
/** Approved for FRU, not yet signed up. */
const CAROL = Object.freeze({
  id: '333333333333333333',
  username: 'carol',
  nickname: 'Carol',
});
const ORGANIZER = Object.freeze({
  id: '555555555555555555',
  username: 'organizer',
});

const FROGS = Object.freeze({
  id: 'frg',
  name: 'Frogs',
  tag: 'FRG',
  color: '#16a34a',
});

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

const SCHEDULE_ID = 'schedule-1';
const EVENT_ID = `${SCHEDULE_ID}-1792094400`;
const OTHER_EVENT_ID = 'reclear-night';
const OTHER_GUILD_EVENT_ID = 'other-guild-night';

/** The roster night, posted by its schedule. */
const ROSTER_NIGHT: EventDocument = Object.freeze({
  guildId: GUILD,
  title: 'FRU prog night',
  startsAt: at('2026-10-12T20:00:00Z'),
  signupsCloseAt: at('2026-10-12T18:00:00Z'),
  signupsCloseDueAt: at('2026-10-12T18:00:00Z'),
  encounters: [Encounter.FRU],
  channelId: EVENTS_CHANNEL,
  createdBy: ORGANIZER.id,
  scheduleId: SCHEDULE_ID,
  status: EventStatus.Open,
});

/** Another posted night, not from a schedule. */
const { scheduleId: _unscheduled, ...OTHER_NIGHT } = {
  ...ROSTER_NIGHT,
  title: 'FRU reclear',
};

/** Mondays at 1 PM Pacific: on to the Monday after the roster night. */
const SCHEDULE: EventScheduleDocument = Object.freeze({
  guildId: GUILD,
  title: 'FRU prog night',
  encounters: [Encounter.FRU],
  channelId: EVENTS_CHANNEL,
  weekdays: ['mon'] satisfies Weekday[],
  startTime: '13:00',
  timeZone: USTimeZones.PACIFIC,
  postLeadHours: 24,
  signupsCloseBeforeHours: 2,
  paused: false,
  nextStartAt: at('2026-10-19T20:00:00Z'),
  nextPostAt: at('2026-10-18T20:00:00Z'),
  createdBy: ORGANIZER.id,
  updatedBy: ORGANIZER.id,
});

const BOB_FRU_ID = `${BOB.id}-${Encounter.FRU}`;
const BOB_FRU: ParticipantDocument = Object.freeze<ParticipantDocument>({
  discordId: BOB.id,
  encounter: Encounter.FRU,
  job: Job.WAR,
  character: 'bob bobson',
  world: 'jenova',
  phase: { roleId: FRU_P4_ROLE, label: 'P4', order: 4, bucket: 'prog' },
  signedUpAt: at('2026-10-07T12:00:00Z'),
});

/** Bob as the board shows him, with `claim`. */
function boardBob(claim: BoardParticipant['claim'] = null): BoardParticipant {
  return {
    id: BOB_FRU_ID,
    encounter: Encounter.FRU,
    discordId: BOB.id,
    displayName: BOB.nickname,
    character: 'bob bobson',
    world: 'jenova',
    job: Job.WAR,
    jobRole: 'tank',
    phase: { label: 'P4', order: 4, bucket: 'prog' },
    claim,
  };
}

/** The roster night as the board shows it, with `overrides`. */
function boardRosterNight(overrides: Partial<BoardEvent> = {}): BoardEvent {
  return {
    id: EVENT_ID,
    title: 'FRU prog night',
    startsAt: '2026-10-12T20:00:00.000Z',
    signupsCloseAt: '2026-10-12T18:00:00.000Z',
    status: 'open',
    encounters: [{ id: Encounter.FRU, name: '[FRU] Futures Rewritten' }],
    participants: [boardBob()],
    squads: [FROGS],
    ...overrides,
  };
}

/** A stream message as `EventSource` receives it: its `id`, and its data. */
const received = (id: number, data: BoardStreamMessage) => ({
  done: false,
  value: { id: String(id), data },
});

/** What a stream gives once the server has ended it. */
const ENDED = Object.freeze({ done: true, value: undefined });

/**
 * Boots the board at NOW with a viewer role, the Frogs and FRU's P4 role,
 * an organizer, Bob signed up for the roster night its schedule posted, Carol
 * approved for FRU, a second posted night, and another guild's night.
 */
async function startFlow(): Promise<HttpFlowApp> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    const flow = await createFlowApp({ http: true });
    flow.discord.addChannel(GUILD, EVENTS_CHANNEL);
    flow.discord.addRole(GUILD, { id: VIEWER_ROLE, name: 'Viewer' });
    flow.discord.addRole(GUILD, { id: FROGS_ROLE, name: 'Frogs' });
    flow.discord.addRole(GUILD, { id: ORGANIZER_ROLE, name: 'Organizer' });
    flow.discord.addRole(GUILD, { id: FRU_P4_ROLE, name: 'FRU P4' });
    flow.discord.addMember({
      id: BOB.id,
      username: BOB.username,
      displayName: BOB.nickname,
      roles: [FRU_P4_ROLE],
    });
    flow.discord.addMember({
      id: CAROL.id,
      username: CAROL.username,
      displayName: CAROL.nickname,
      roles: [FRU_P4_ROLE],
    });
    flow.discord.addMember({
      id: ORGANIZER.id,
      username: ORGANIZER.username,
      roles: [ORGANIZER_ROLE],
    });
    flow.db.seed(`settings/${GUILD}`, {
      boardViewerRoles: [VIEWER_ROLE],
      eventOrganizerRoles: [ORGANIZER_ROLE],
      progPointRoles: { FRU: { P4: FRU_P4_ROLE } },
      squads: {
        frg: {
          name: FROGS.name,
          tag: FROGS.tag,
          color: FROGS.color,
          roleId: FROGS_ROLE,
        },
      },
    });
    flow.db.seed(`encounters/${Encounter.FRU}/prog-points/P4`, {
      id: 'P4',
      label: 'P4',
      partyStatus: PartyStatus.ProgParty,
      order: 4,
      active: true,
    });
    seedSignup(flow, {
      status: SignupStatus.APPROVED,
      discordId: CAROL.id,
      username: CAROL.username,
      encounter: Encounter.FRU,
      character: 'carol carolson',
      world: 'gilgamesh',
    });

    flow.db.seed(`event-schedules/${SCHEDULE_ID}`, SCHEDULE);
    flow.db.seed(`events/${EVENT_ID}`, ROSTER_NIGHT);
    await flow.get(EventMessageService).post({ ...ROSTER_NIGHT, id: EVENT_ID });
    flow.db.seed(`events/${EVENT_ID}/participants/${BOB_FRU_ID}`, BOB_FRU);
    flow.db.seed(`events/${OTHER_EVENT_ID}`, OTHER_NIGHT);
    await flow
      .get(EventMessageService)
      .post({ ...OTHER_NIGHT, id: OTHER_EVENT_ID });
    flow.db.seed(`events/${OTHER_GUILD_EVENT_ID}`, {
      ...OTHER_NIGHT,
      guildId: 'other-guild',
    });
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

/** `streams` depends on `flow`, so its teardown closes every stream before the app. */
const it = base.extend<{ flow: HttpFlowApp; streams: OpenStreams }>({
  flow: fresh(startFlow, stopFlow),
  streams: async ({ flow: _closedAfterTheStreams }, use) => {
    const streams = openStreams();
    try {
      await use(streams);
    } finally {
      await streams.closeAll();
    }
  },
});

const streamPath = (eventId: string) => `/api/events/${eventId}/stream`;

/** `account` joins the board guild holding `roles` and signs in on `agent`. */
async function signIn(
  flow: HttpFlowApp,
  account: DiscordAccount,
  roles: string[],
  agent: Agent = flow.http,
): Promise<void> {
  flow.discord.addMember({
    id: account.id,
    username: account.username,
    globalName: account.globalName,
    roles,
  });
  await signInAs(flow, account, agent);
}

/** Alice opens the roster night's board, and it has shown its snapshot. */
async function openRosterNight(flow: HttpFlowApp, streams: OpenStreams) {
  const stream = await streams.open(flow.http, streamPath(EVENT_ID));
  await stream.next();
  return stream;
}

function eventPost(flow: HttpFlowApp) {
  const [message] = flow.discord.channel(EVENTS_CHANNEL);
  if (!message) throw new Error(`nothing was posted in ${EVENTS_CHANNEL}`);
  return message;
}

/** `userId`'s latest private reply, with a select menu. */
function prompt(flow: HttpFlowApp, userId: string) {
  const reply = flow.discord
    .repliesTo(userId)
    .findLast(
      (message) => message.componentsOfType(ComponentType.StringSelect).length,
    );
  if (!reply) throw new Error(`${userId} has no reply with a select menu`);
  return reply;
}

/** The organizer's latest reply: the panel of the command they ran last. */
function panel(flow: HttpFlowApp) {
  const reply = flow.discord.repliesTo(ORGANIZER.id).at(-1);
  if (!reply) throw new Error('expected the organizer to have a reply');
  return reply;
}

/** The organizer runs `/event <subcommand>`, and the bot finishes with it. */
async function event(
  flow: HttpFlowApp,
  subcommand: string,
  options: Record<string, string | number>,
) {
  flow.discord.command({
    userId: ORGANIZER.id,
    guildId: GUILD,
    channelId: EVENTS_CHANNEL,
    commandName: 'event',
    subcommand,
    options,
  });
  await flow.settle();
}

async function get(flow: HttpFlowApp, path: string) {
  const { status, body } = await flow.http.get(path);
  return { status, body };
}

const NOT_FOUND = Object.freeze({ status: 404, body: { reason: 'not-found' } });

describe('when someone who is not signed in opens an event stream', () => {
  it('answers 401 signed-out', async ({ flow }) => {
    await expect(get(flow, streamPath(EVENT_ID))).resolves.toEqual({
      status: 401,
      body: { reason: 'signed-out' },
    });
  });
});

describe('when a viewer opens an event stream', () => {
  it.beforeEach(({ flow }) => signIn(flow, ALICE, [VIEWER_ROLE]));

  it('first sends the whole event', async ({ flow, streams }) => {
    const stream = await streams.open(flow.http, streamPath(EVENT_ID));

    await expect(stream.next()).resolves.toEqual(
      received(1, { type: 'snapshot', event: boardRosterNight() }),
    );
  });

  it('sends a ping comment every 25 seconds', async ({ flow, streams }) => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const stream = await openRosterNight(flow, streams);

    vi.advanceTimersByTime(50_000);

    // the real setTimeout bounds the wait, so a missing ping fails here
    const next = () => Promise.race([stream.next(), sleep(1_000, 'nothing')]);
    expect([await next(), await next()]).toEqual([
      { done: false, value: { comment: 'ping' } },
      { done: false, value: { comment: 'ping' } },
    ]);
  });

  it("answers another guild's event 404 not-found", async ({ flow }) => {
    await expect(get(flow, streamPath(OTHER_GUILD_EVENT_ID))).resolves.toEqual(
      NOT_FOUND,
    );
  });

  it('answers an unknown event 404 not-found', async ({ flow }) => {
    await expect(get(flow, streamPath('no-such-night'))).resolves.toEqual(
      NOT_FOUND,
    );
  });

  it('answers an id of .. 404 not-found', async ({ flow }) => {
    await expect(get(flow, streamPath('%2E%2E'))).resolves.toEqual(NOT_FOUND);
  });

  describe('and the bot shuts down while the stream is open', () => {
    it('closes without waiting for the stream to end', async ({
      flow,
      streams,
    }) => {
      const stream = await openRosterNight(flow, streams);

      // the real setTimeout bounds the wait, so a close that hangs fails here
      const closing = await Promise.race([
        flow.close().then(() => 'closed'),
        sleep(1_000, 'still open'),
      ]);

      const ended = await Promise.race([stream.next(), sleep(1_000, 'open')]);

      expect({ closing, stream: ended }).toEqual({
        closing: 'closed',
        stream: ENDED,
      });
    });
  });

  describe('and a player signs up in Discord', () => {
    it('sends the new participant', async ({ flow, streams }) => {
      const stream = await openRosterNight(flow, streams);

      flow.discord.click(eventPost(flow), `event:signup:${EVENT_ID}`, CAROL.id);
      await flow.settle();
      flow.discord.choose(prompt(flow, CAROL.id), Job.SGE, CAROL.id);
      await flow.settle();

      await expect(stream.next()).resolves.toEqual(
        received(2, {
          type: 'participant-upserted',
          participant: {
            id: `${CAROL.id}-${Encounter.FRU}`,
            encounter: Encounter.FRU,
            discordId: CAROL.id,
            displayName: CAROL.nickname,
            character: 'carol carolson',
            world: 'gilgamesh',
            job: Job.SGE,
            jobRole: 'healer',
            phase: { label: 'FRU P4', order: 4, bucket: 'prog' },
            claim: null,
          },
        }),
      );
    });
  });

  describe('and a squad claims a player in another browser', () => {
    it('sends the player with the claim', async ({ flow, streams }) => {
      const stream = await openRosterNight(flow, streams);
      const frogs = flow.agent();
      await signIn(flow, DAVE, [FROGS_ROLE], frogs);

      await frogs
        .post(`/api/events/${EVENT_ID}/participants/${BOB_FRU_ID}/claim`)
        .send({});

      await expect(stream.next()).resolves.toEqual(
        received(2, {
          type: 'participant-upserted',
          participant: boardBob({
            squadId: FROGS.id,
            claimedBy: DAVE.id,
            claimedAt: NOW.toISOString(),
          }),
        }),
      );
    });
  });

  describe('and a player withdraws in Discord', () => {
    it('sends that they were removed', async ({ flow, streams }) => {
      const stream = await openRosterNight(flow, streams);

      flow.discord.click(eventPost(flow), `event:withdraw:${EVENT_ID}`, BOB.id);
      await flow.settle();

      await expect(stream.next()).resolves.toEqual(
        received(2, { type: 'participant-removed', participantId: BOB_FRU_ID }),
      );
    });
  });

  describe('and an organizer closes the event', () => {
    it('sends the whole event again, closed', async ({ flow, streams }) => {
      const stream = await openRosterNight(flow, streams);

      await event(flow, 'close', { event: EVENT_ID });

      await expect(stream.next()).resolves.toEqual(
        received(2, {
          type: 'snapshot',
          event: boardRosterNight({ status: 'closed' }),
        }),
      );
    });
  });

  describe("and an organizer renames the event's schedule", () => {
    it('sends the whole event again, renamed', async ({ flow, streams }) => {
      const stream = await openRosterNight(flow, streams);

      await event(flow, 'schedule-edit', {
        schedule: SCHEDULE_ID,
        title: 'FRU reclear night',
      });
      flow.discord.click(panel(flow), 'scheduleSave', ORGANIZER.id);
      await flow.settle();

      await expect(stream.next()).resolves.toEqual(
        received(2, {
          type: 'snapshot',
          event: boardRosterNight({ title: 'FRU reclear night' }),
        }),
      );
    });
  });

  describe('and Firestore is unreachable when the event changes', () => {
    it('reports it and ends that stream, and another stream keeps going', async ({
      flow,
      streams,
    }) => {
      flow.db.seed(
        `events/${OTHER_EVENT_ID}/participants/${BOB_FRU_ID}`,
        BOB_FRU,
      );
      const failing = await openRosterNight(flow, streams);
      const other = await streams.open(flow.http, streamPath(OTHER_EVENT_ID));
      await other.next();

      flow.db.goOffline();
      flow.get(EventChangesBus).publish({ kind: 'event', eventId: EVENT_ID });
      const ended = await failing.next();
      flow.db.goOnline();
      const frogs = flow.agent();
      await signIn(flow, DAVE, [FROGS_ROLE], frogs);
      await frogs
        .post(`/api/events/${OTHER_EVENT_ID}/participants/${BOB_FRU_ID}/claim`)
        .send({});

      expect({ ended, other: await other.next() }).toEqual({
        ended: ENDED,
        other: received(2, {
          type: 'participant-upserted',
          participant: boardBob({
            squadId: FROGS.id,
            claimedBy: DAVE.id,
            claimedAt: NOW.toISOString(),
          }),
        }),
      });
      await flow.settle();
      flow.expectReported(/^Sentry exception: .*14 UNAVAILABLE/s);
      flow.expectReported(
        new RegExp(`^error: .*Board stream for event ${EVENT_ID} failed`, 's'),
      );
    });
  });
});
