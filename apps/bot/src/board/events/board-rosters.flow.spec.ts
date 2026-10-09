import {
  type BoardRoster,
  Encounter,
  Job,
  type RosterTeam,
  type SlotFill,
} from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import type { Agent } from 'supertest';
import { test as base, describe, expect, onTestFinished, vi } from 'vitest';
import { boardConfig } from '../../config/board.js';
import {
  type EventDocument,
  EventStatus,
  type ParticipantDocument,
} from '../../firebase/models/event.model.js';
import {
  type RosterDocument,
  rosterDocId,
} from '../../firebase/models/roster.model.js';
import {
  type DiscordAccount,
  signInAs,
} from '../../test-utils/discord-oauth.js';
import { recordChanges } from '../../test-utils/events.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type HttpFlowApp } from '../../test-utils/flow-app.js';
import { type OpenStreams, openStreams } from '../../test-utils/sse.js';

const GUILD = boardConfig.GUILD_ID;
const VIEWER_ROLE = 'role-viewer';
const FROGS_ROLE = 'role-frogs';
const OWLS_ROLE = 'role-owls';
const NOW = new Date('2026-10-08T12:00:00Z');

const FROGS = Object.freeze({ id: 'frg', roleId: FROGS_ROLE });
const OWLS = Object.freeze({ id: 'owl', roleId: OWLS_ROLE });

/** Leads the Frogs. */
const ALICE: DiscordAccount = Object.freeze({
  id: '111111111111111111',
  username: 'alice',
  globalName: 'Alice',
});
/** Also leads the Frogs. */
const GINA: DiscordAccount = Object.freeze({
  id: '777777777777777777',
  username: 'gina',
  globalName: 'Gina',
});
/** Leads the Owls. */
const DAVE: DiscordAccount = Object.freeze({
  id: '444444444444444444',
  username: 'dave',
  globalName: 'Dave',
});
/** Holds the Frogs role, so the Frogs can bring him as a helper. */
const HANK = Object.freeze({
  id: '888888888888888888',
  username: 'hank',
  displayName: 'Hank the Healer',
});
/** Hank as a slot shows him. */
const HANK_HELPER = Object.freeze<SlotFill>({
  kind: 'helper',
  discordId: HANK.id,
  displayName: HANK.displayName,
});
/** In the server, but in no squad. */
const GUS = Object.freeze({ id: '999999999999999999', username: 'gus' });
/** Not in the server. */
const STRANGER_ID = '121212121212121212';

const EVENT_ID = 'roster-night';
const CLOSED_EVENT_ID = 'closed-night';
const OTHER_GUILD_EVENT_ID = 'other-guild-night';

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

const ROSTER_NIGHT: EventDocument = Object.freeze<EventDocument>({
  guildId: GUILD,
  title: 'FRU prog night',
  startsAt: at('2026-10-12T20:00:00Z'),
  signupsCloseAt: at('2026-10-12T18:00:00Z'),
  signupsCloseDueAt: at('2026-10-12T18:00:00Z'),
  encounters: [Encounter.FRU],
  channelId: 'events-channel',
  createdBy: ALICE.id,
  status: EventStatus.Open,
});

const frogsClaim = Object.freeze({
  squadId: FROGS.id,
  claimedBy: ALICE.id,
  claimedAt: at('2026-10-08T09:00:00Z'),
});

function signedUp(
  discordId: string,
  claim?: ParticipantDocument['claim'],
): ParticipantDocument {
  return {
    discordId,
    encounter: Encounter.FRU,
    job: Job.WAR,
    character: `player ${discordId}`,
    world: 'jenova',
    phase: { roleId: 'fru-p4', label: 'P4', order: 4, bucket: 'prog' },
    signedUpAt: at('2026-10-07T12:00:00Z'),
    ...(claim ? { claim } : {}),
  };
}

/** Claimed by the Frogs, and in Team 1's Melee slot. */
const BOB_ID = '222222222222222222';
/** Claimed by the Frogs, not placed yet. */
const CAROL_ID = '333333333333333333';
/** Claimed by the Owls. */
const ERIN_ID = '555555555555555555';
/** Signed up, claimed by nobody. */
const FRANK_ID = '666666666666666666';
const fru = (discordId: string) => `${discordId}-${Encounter.FRU}`;

const BOB = Object.freeze<SlotFill>({
  kind: 'progger',
  participantId: fru(BOB_ID),
  discordId: BOB_ID,
});
const CAROL = Object.freeze<SlotFill>({
  kind: 'progger',
  participantId: fru(CAROL_ID),
  discordId: CAROL_ID,
});

const TEAM_1: RosterTeam = Object.freeze({
  id: 'team0001',
  slots: Object.freeze({ melee: BOB }),
});
const TEAM_2: RosterTeam = Object.freeze({ id: 'team0002', slots: {} });

/** The Frogs' FRU roster before each test. */
const FROGS_ROSTER: RosterDocument = Object.freeze<RosterDocument>({
  guildId: GUILD,
  encounter: Encounter.FRU,
  squadId: FROGS.id,
  teams: [TEAM_1, TEAM_2],
});

const rosterPath = (squadId: string, eventId = EVENT_ID) =>
  `events/${eventId}/rosters/${rosterDocId(Encounter.FRU, squadId)}`;
const api = (rest: string, eventId = EVENT_ID, encounter = 'FRU') =>
  `/api/events/${eventId}/rosters/${encounter}${rest}`;
const slotPath = (teamId: string, slot: string, eventId = EVENT_ID) =>
  api(`/teams/${teamId}/slots/${slot}`, eventId);

/** The Frogs' FRU roster as the API answers it, with `teams`. */
const frogsRoster = (teams: RosterTeam[]): BoardRoster => ({
  encounter: Encounter.FRU,
  squadId: FROGS.id,
  teams,
});
/** The Frogs' FRU roster as stored, with `teams`. */
const storedFrogs = (teams: RosterTeam[]): RosterDocument => ({
  guildId: GUILD,
  ...frogsRoster(teams),
});

const NEW_TEAM_ID = expect.stringMatching(/^[0-9a-f]{8}$/);

/**
 * Boots the board with two squads, the roster night and a closed night, both
 * with the Frogs' FRU roster, and its sign-ups: Bob and Carol claimed by the
 * Frogs, Erin by the Owls, and Frank by nobody.
 */
async function startFlow(): Promise<HttpFlowApp> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    const flow = await createFlowApp({ http: true });
    flow.discord.addRole(GUILD, { id: VIEWER_ROLE, name: 'Viewer' });
    flow.discord.addRole(GUILD, { id: FROGS_ROLE, name: 'Frogs' });
    flow.discord.addRole(GUILD, { id: OWLS_ROLE, name: 'Owls' });
    flow.discord.addMember({ ...HANK, roles: [FROGS_ROLE] });
    flow.discord.addMember(GUS);
    flow.db.seed(`settings/${GUILD}`, {
      boardViewerRoles: [VIEWER_ROLE],
      squads: {
        frg: {
          name: 'Frogs',
          tag: 'FRG',
          color: '#16a34a',
          roleId: FROGS_ROLE,
        },
        owl: { name: 'Owls', tag: 'OWL', color: '#7c3aed', roleId: OWLS_ROLE },
      },
    });
    flow.db.seed(`events/${CLOSED_EVENT_ID}`, {
      ...ROSTER_NIGHT,
      status: EventStatus.Closed,
    });
    flow.db.seed(`events/${EVENT_ID}`, ROSTER_NIGHT);
    flow.db.seed(`events/${OTHER_GUILD_EVENT_ID}`, {
      ...ROSTER_NIGHT,
      guildId: 'other-guild',
    });
    for (const eventId of [EVENT_ID, CLOSED_EVENT_ID]) {
      const participant = (discordId: string) =>
        `events/${eventId}/participants/${fru(discordId)}`;
      flow.db.seed(participant(BOB_ID), signedUp(BOB_ID, frogsClaim));
      flow.db.seed(participant(CAROL_ID), signedUp(CAROL_ID, frogsClaim));
      flow.db.seed(
        participant(ERIN_ID),
        signedUp(ERIN_ID, {
          squadId: OWLS.id,
          claimedBy: DAVE.id,
          claimedAt: at('2026-10-08T09:00:00Z'),
        }),
      );
      flow.db.seed(participant(FRANK_ID), signedUp(FRANK_ID));
      flow.db.seed(rosterPath(FROGS.id, eventId), FROGS_ROSTER);
    }
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

async function addTeam(agent: Agent, path = api('/teams')) {
  const { status, body } = await agent.post(path).send({});
  return { status, body };
}

async function removeTeam(agent: Agent, teamId: string) {
  const { status, body } = await agent.delete(api(`/teams/${teamId}`));
  return { status, body };
}

async function fill(agent: Agent, path: string, pick: object) {
  const { status, body } = await agent.put(path).send(pick);
  return { status, body };
}

async function clear(agent: Agent, path: string) {
  const { status, body } = await agent.delete(path);
  return { status, body };
}

const progger = (discordId: string) => ({
  kind: 'progger',
  participantId: fru(discordId),
});
const helper = (discordId: string) => ({ kind: 'helper', discordId });

const NOT_FOUND = Object.freeze({ status: 404, body: { reason: 'not-found' } });

describe('when a Frogs lead edits their roster', () => {
  it.beforeEach(({ flow }) => signIn(flow, ALICE, [FROGS_ROLE]));

  it('adds an empty team', async ({ flow }) => {
    const added = [TEAM_1, TEAM_2, { id: NEW_TEAM_ID, slots: {} }];

    await expect(addTeam(flow.http)).resolves.toEqual({
      status: 200,
      body: frogsRoster(added),
    });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(storedFrogs(added));
  });

  it('answers a 7th team 409 team-limit and keeps six', async ({ flow }) => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `team000${n}`,
      slots: {},
    }));
    flow.db.seed(rosterPath(FROGS.id), storedFrogs(six));

    await expect(addTeam(flow.http)).resolves.toEqual({
      status: 409,
      body: { reason: 'team-limit' },
    });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(storedFrogs(six));
  });

  it('answers removing a team with a filled slot 409 team-not-empty and keeps it', async ({
    flow,
  }) => {
    await expect(removeTeam(flow.http, TEAM_1.id)).resolves.toEqual({
      status: 409,
      body: { reason: 'team-not-empty' },
    });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(FROGS_ROSTER);
  });

  it('removes an empty team', async ({ flow }) => {
    await expect(removeTeam(flow.http, TEAM_2.id)).resolves.toEqual({
      status: 200,
      body: frogsRoster([TEAM_1]),
    });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(storedFrogs([TEAM_1]));
  });

  it('places a progger the Frogs claimed', async ({ flow }) => {
    const placed = [TEAM_1, { ...TEAM_2, slots: { 'tank-1': CAROL } }];

    await expect(
      fill(flow.http, slotPath(TEAM_2.id, 'tank-1'), progger(CAROL_ID)),
    ).resolves.toEqual({ status: 200, body: frogsRoster(placed) });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(storedFrogs(placed));
  });

  it.for([
    ['nobody has claimed', FRANK_ID],
    ['the Owls claimed', ERIN_ID],
  ])(
    'answers placing a progger %s 409 not-claimed and leaves the roster',
    async ([, discordId], { flow }) => {
      await expect(
        fill(flow.http, slotPath(TEAM_2.id, 'tank-1'), progger(discordId)),
      ).resolves.toEqual({ status: 409, body: { reason: 'not-claimed' } });
      expect(flow.db.read(rosterPath(FROGS.id))).toEqual(FROGS_ROSTER);
    },
  );

  it('places a helper from the Frogs role under their display name', async ({
    flow,
  }) => {
    const placed = [
      TEAM_1,
      {
        ...TEAM_2,
        slots: {
          'regen-healer': HANK_HELPER,
        },
      },
    ];

    await expect(
      fill(flow.http, slotPath(TEAM_2.id, 'regen-healer'), helper(HANK.id)),
    ).resolves.toEqual({ status: 200, body: frogsRoster(placed) });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(storedFrogs(placed));
  });

  it.for([
    ['without the Frogs role', GUS.id],
    ['who is not in the server', STRANGER_ID],
  ])(
    'answers placing a helper %s 403 not-a-helper and leaves the roster',
    async ([, discordId], { flow }) => {
      await expect(
        fill(flow.http, slotPath(TEAM_2.id, 'caster'), helper(discordId)),
      ).resolves.toEqual({ status: 403, body: { reason: 'not-a-helper' } });
      expect(flow.db.read(rosterPath(FROGS.id))).toEqual(FROGS_ROSTER);
    },
  );

  it('moves someone placed in Team 1 to the slot in Team 2', async ({
    flow,
  }) => {
    const moved = [
      { ...TEAM_1, slots: {} },
      { ...TEAM_2, slots: { 'tank-1': BOB } },
    ];

    await expect(
      fill(flow.http, slotPath(TEAM_2.id, 'tank-1'), progger(BOB_ID)),
    ).resolves.toEqual({ status: 200, body: frogsRoster(moved) });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(storedFrogs(moved));
  });

  it('replaces the occupant of a filled slot', async ({ flow }) => {
    const replaced = [{ ...TEAM_1, slots: { melee: CAROL } }, TEAM_2];

    await expect(
      fill(flow.http, slotPath(TEAM_1.id, 'melee'), progger(CAROL_ID)),
    ).resolves.toEqual({ status: 200, body: frogsRoster(replaced) });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(storedFrogs(replaced));
  });

  it('empties a slot', async ({ flow }) => {
    const cleared = [{ ...TEAM_1, slots: {} }, TEAM_2];

    await expect(
      clear(flow.http, slotPath(TEAM_1.id, 'melee')),
    ).resolves.toEqual({ status: 200, body: frogsRoster(cleared) });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(storedFrogs(cleared));
  });

  it.for([
    ['an unknown team', slotPath('no-team', 'melee')],
    ['an unknown slot', slotPath(TEAM_1.id, 'tank-3')],
  ])(
    'answers a slot in %s 404 not-found and leaves the roster',
    async ([, path], { flow }) => {
      await expect(fill(flow.http, path, progger(CAROL_ID))).resolves.toEqual(
        NOT_FOUND,
      );
      expect(flow.db.read(rosterPath(FROGS.id))).toEqual(FROGS_ROSTER);
    },
  );

  it('answers a team on an encounter the event lacks 404 not-found and stores no roster', async ({
    flow,
  }) => {
    await expect(
      addTeam(flow.http, api('/teams', EVENT_ID, Encounter.TOP)),
    ).resolves.toEqual(NOT_FOUND);
    expect(
      flow.db.read(
        `events/${EVENT_ID}/rosters/${rosterDocId(Encounter.TOP, FROGS.id)}`,
      ),
    ).toBeUndefined();
  });

  it("answers another guild's event 404 not-found and stores no roster", async ({
    flow,
  }) => {
    await expect(
      addTeam(flow.http, api('/teams', OTHER_GUILD_EVENT_ID)),
    ).resolves.toEqual(NOT_FOUND);
    expect(
      flow.db.read(rosterPath(FROGS.id, OTHER_GUILD_EVENT_ID)),
    ).toBeUndefined();
  });

  it('fills a slot on an event whose sign-ups have closed', async ({
    flow,
  }) => {
    flow.db.seed(`events/${EVENT_ID}`, {
      ...ROSTER_NIGHT,
      status: EventStatus.SignupsClosed,
    });
    const placed = [TEAM_1, { ...TEAM_2, slots: { 'tank-1': CAROL } }];

    await expect(
      fill(flow.http, slotPath(TEAM_2.id, 'tank-1'), progger(CAROL_ID)),
    ).resolves.toEqual({ status: 200, body: frogsRoster(placed) });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(storedFrogs(placed));
  });

  it('answers a pick that is neither a progger nor a helper 400 bad-request', async ({
    flow,
  }) => {
    await expect(
      fill(flow.http, slotPath(TEAM_2.id, 'melee'), { kind: 'progger' }),
    ).resolves.toEqual({ status: 400, body: { reason: 'bad-request' } });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(FROGS_ROSTER);
  });

  it('answers a closed event 409 closed and leaves its roster', async ({
    flow,
  }) => {
    await expect(
      fill(
        flow.http,
        slotPath(TEAM_2.id, 'tank-1', CLOSED_EVENT_ID),
        progger(CAROL_ID),
      ),
    ).resolves.toEqual({ status: 409, body: { reason: 'closed' } });
    expect(flow.db.read(rosterPath(FROGS.id, CLOSED_EVENT_ID))).toEqual(
      FROGS_ROSTER,
    );
  });

  it('sends the roster to a board open on the event', async ({
    flow,
    streams,
  }) => {
    const stream = await streams.open(
      flow.http,
      `/api/events/${EVENT_ID}/stream`,
    );
    await stream.next();

    await clear(flow.http, slotPath(TEAM_1.id, 'melee'));

    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: {
        id: '2',
        data: {
          type: 'roster-updated',
          roster: frogsRoster([{ ...TEAM_1, slots: {} }, TEAM_2]),
        },
      },
    });
  });
});

describe('when two Frogs leads fill slots of the same team at once', () => {
  it('keeps both', async ({ flow }) => {
    const gina = flow.agent();
    await signIn(flow, ALICE, [FROGS_ROLE]);
    await signIn(flow, GINA, [FROGS_ROLE], gina);
    flow.db.overlapTransactions(2);

    await Promise.all([
      fill(flow.http, slotPath(TEAM_2.id, 'tank-1'), helper(HANK.id)),
      fill(gina, slotPath(TEAM_2.id, 'shield-healer'), helper(GINA.id)),
    ]);

    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(
      storedFrogs([
        TEAM_1,
        {
          ...TEAM_2,
          slots: {
            'tank-1': HANK_HELPER,
            'shield-healer': {
              kind: 'helper',
              discordId: GINA.id,
              displayName: 'Gina',
            },
          },
        },
      ]),
    );
  });
});

describe('when an Owls lead adds a team on FRU', () => {
  it("changes only the Owls' roster", async ({ flow }) => {
    await signIn(flow, DAVE, [OWLS_ROLE]);

    await expect(addTeam(flow.http)).resolves.toEqual({
      status: 200,
      body: {
        encounter: Encounter.FRU,
        squadId: OWLS.id,
        teams: [{ id: NEW_TEAM_ID, slots: {} }],
      },
    });
    expect({
      owls: flow.db.read(rosterPath(OWLS.id)),
      frogs: flow.db.read(rosterPath(FROGS.id)),
    }).toEqual({
      owls: {
        guildId: GUILD,
        encounter: Encounter.FRU,
        squadId: OWLS.id,
        teams: [{ id: NEW_TEAM_ID, slots: {} }],
      },
      frogs: FROGS_ROSTER,
    });
  });
});

describe('when a viewer adds a team', () => {
  it('answers 403 no-squad and leaves the roster', async ({ flow }) => {
    await signIn(flow, ALICE, [VIEWER_ROLE]);

    await expect(addTeam(flow.http)).resolves.toEqual({
      status: 403,
      body: { reason: 'no-squad' },
    });
    expect(flow.db.read(rosterPath(FROGS.id))).toEqual(FROGS_ROSTER);
  });
});

/** Releases the Frogs' claim on `discordId`'s FRU sign-up. */
async function release(agent: Agent, discordId: string) {
  const { status, body } = await agent.delete(
    `/api/events/${EVENT_ID}/participants/${fru(discordId)}/claim`,
  );
  return { status, body };
}

describe('when a Frogs lead releases Bob, whom Team 1 has in Melee', () => {
  it.beforeEach(({ flow }) => signIn(flow, ALICE, [FROGS_ROLE]));

  it('empties his slot, and a board open on the event hears him change, then the roster', async ({
    flow,
    streams,
  }) => {
    const stream = await streams.open(
      flow.http,
      `/api/events/${EVENT_ID}/stream`,
    );
    await stream.next();

    const { body: released } = await release(flow.http, BOB_ID);

    const emptied = [{ ...TEAM_1, slots: {} }, TEAM_2];
    expect({
      stored: flow.db.read(rosterPath(FROGS.id)),
      heard: [await stream.next(), await stream.next()],
    }).toEqual({
      stored: storedFrogs(emptied),
      heard: [
        {
          done: false,
          value: {
            id: '2',
            data: { type: 'participant-upserted', participant: released },
          },
        },
        {
          done: false,
          value: {
            id: '3',
            data: { type: 'roster-updated', roster: frogsRoster(emptied) },
          },
        },
      ],
    });
  });
});

describe('when a Frogs lead releases Carol, who has no slot', () => {
  it('writes no roster and tells a board open on the event only that she changed', async ({
    flow,
  }) => {
    await signIn(flow, ALICE, [FROGS_ROLE]);
    const changes = recordChanges(flow, EVENT_ID);
    const written: string[] = [];
    onTestFinished(flow.db.onWrite((path) => written.push(path)));

    await release(flow.http, CAROL_ID);

    expect({ written, changes }).toEqual({
      written: [`events/${EVENT_ID}/participants/${fru(CAROL_ID)}`],
      changes: [
        {
          kind: 'participant',
          eventId: EVENT_ID,
          participantId: fru(CAROL_ID),
        },
      ],
    });
  });
});
