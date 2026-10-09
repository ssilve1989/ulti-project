import { type BoardParticipant, Encounter, Job } from '@ulti-project/shared';
import { PermissionFlagsBits } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import type { Agent } from 'supertest';
import { test as base, describe, expect, vi } from 'vitest';
import { boardConfig } from '../../config/board.js';
import { EventMessageService } from '../../events/event-message.service.js';
import {
  type EventDocument,
  EventStatus,
  type ParticipantDocument,
} from '../../firebase/models/event.model.js';
import {
  type DiscordAccount,
  signInAs,
} from '../../test-utils/discord-oauth.js';
import { recordChanges } from '../../test-utils/events.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type HttpFlowApp } from '../../test-utils/flow-app.js';

const GUILD = boardConfig.GUILD_ID;
const EVENTS_CHANNEL = 'events-channel';
const VIEWER_ROLE = 'role-viewer';
const FROGS_ROLE = 'role-frogs';
const OWLS_ROLE = 'role-owls';
const NOW = new Date('2026-10-08T12:00:00Z');

/** Leads the Frogs. */
const ALICE: DiscordAccount = Object.freeze({
  id: '111111111111111111',
  username: 'alice',
  globalName: 'Alice',
});
/** Leads the Owls. */
const DAVE: DiscordAccount = Object.freeze({
  id: '444444444444444444',
  username: 'dave',
  globalName: 'Dave',
});
const BOB = Object.freeze({
  id: '222222222222222222',
  username: 'bob',
  nickname: 'Bob (main tank)',
});
/** Manages the server's settings. */
const ADMIN = Object.freeze({
  id: '666666666666666666',
  username: 'admin',
  permissions: PermissionFlagsBits.ManageGuild,
});
/** Signed up for nothing: their sign-up was withdrawn. */
const CAROL_ID = '333333333333333333';

const FROGS = Object.freeze({ id: 'frg', roleId: FROGS_ROLE });
const OWLS = Object.freeze({ id: 'owl', roleId: OWLS_ROLE });

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

function anEvent(overrides: Partial<EventDocument>): EventDocument {
  return {
    guildId: GUILD,
    title: 'FRU prog night',
    startsAt: at('2026-10-12T20:00:00Z'),
    signupsCloseAt: at('2026-10-12T18:00:00Z'),
    signupsCloseDueAt: at('2026-10-12T18:00:00Z'),
    encounters: [Encounter.FRU],
    channelId: EVENTS_CHANNEL,
    createdBy: ALICE.id,
    status: EventStatus.Open,
    ...overrides,
  };
}

/** Sign-ups have closed, so it's no longer due to close them. */
function signupsClosed({
  signupsCloseDueAt: _due,
  ...event
}: EventDocument): EventDocument {
  return { ...event, status: EventStatus.SignupsClosed };
}

const EVENT_ID = 'roster-night';
const SIGNUPS_CLOSED_EVENT_ID = 'signups-closed-night';
const CLOSED_EVENT_ID = 'closed-night';
const OTHER_GUILD_EVENT_ID = 'other-guild-night';

const BOB_FRU_ID = `${BOB.id}-${Encounter.FRU}`;
const BOB_FRU: ParticipantDocument = Object.freeze<ParticipantDocument>({
  discordId: BOB.id,
  encounter: Encounter.FRU,
  job: Job.WAR,
  character: 'bob bobson',
  world: 'jenova',
  phase: { roleId: 'fru-p4', label: 'P4', order: 4, bucket: 'prog' },
  signedUpAt: at('2026-10-07T12:00:00Z'),
});

const bobPath = (eventId: string) =>
  `events/${eventId}/participants/${BOB_FRU_ID}`;
const claimPath = (eventId: string, participantId = BOB_FRU_ID) =>
  `/api/events/${eventId}/participants/${participantId}/claim`;

/** Bob as the board shows him, with `claim`. */
function boardBob(claim: BoardParticipant['claim']): BoardParticipant {
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

/** The Owls' claim on Bob, made before the test. */
const OWLS_CLAIM = Object.freeze({
  squadId: OWLS.id,
  claimedBy: DAVE.id,
  claimedAt: at('2026-10-08T09:30:00Z'),
});

/** Seeds the event and posts its message, as the bot had. */
async function postEvent(
  flow: HttpFlowApp,
  id: string,
  event: EventDocument,
): Promise<void> {
  flow.db.seed(`events/${id}`, event);
  await flow.get(EventMessageService).post({ ...event, id });
}

/**
 * Boots the board at NOW with a viewer role and two squads, and Bob signed up
 * for the posted roster night, a posted night whose sign-ups have closed, a
 * closed night, and another guild's night.
 */
async function startFlow(): Promise<HttpFlowApp> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    const flow = await createFlowApp({ http: true });
    flow.discord.addChannel(GUILD, EVENTS_CHANNEL);
    flow.discord.addRole(GUILD, { id: VIEWER_ROLE, name: 'Viewer' });
    flow.discord.addRole(GUILD, { id: FROGS_ROLE, name: 'Frogs' });
    flow.discord.addRole(GUILD, { id: OWLS_ROLE, name: 'Owls' });
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
        owl: { name: 'Owls', tag: 'OWL', color: '#7c3aed', roleId: OWLS_ROLE },
      },
    });

    await postEvent(flow, EVENT_ID, anEvent({}));
    await postEvent(
      flow,
      SIGNUPS_CLOSED_EVENT_ID,
      signupsClosed(anEvent({ title: 'FRU reclear' })),
    );
    flow.db.seed(`events/${CLOSED_EVENT_ID}`, {
      ...signupsClosed(anEvent({ title: 'Last week' })),
      status: EventStatus.Closed,
    });
    flow.db.seed(
      `events/${OTHER_GUILD_EVENT_ID}`,
      anEvent({ guildId: 'other-guild' }),
    );
    for (const eventId of [
      EVENT_ID,
      SIGNUPS_CLOSED_EVENT_ID,
      CLOSED_EVENT_ID,
      OTHER_GUILD_EVENT_ID,
    ]) {
      flow.db.seed(bobPath(eventId), BOB_FRU);
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

const it = base.extend<{ flow: HttpFlowApp }>({
  flow: fresh(startFlow, stopFlow),
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

async function claim(
  flow: HttpFlowApp,
  path = claimPath(EVENT_ID),
  agent: Agent = flow.http,
) {
  const { status, body } = await agent.post(path).send({});
  return { status, body };
}

async function release(flow: HttpFlowApp, path = claimPath(EVENT_ID)) {
  const { status, body } = await flow.http.delete(path).send({});
  return { status, body };
}

/** What a board open on the roster night hears when Bob changes. */
const BOB_CHANGED = Object.freeze({
  kind: 'participant',
  eventId: EVENT_ID,
  participantId: BOB_FRU_ID,
});

const NOT_FOUND = Object.freeze({ status: 404, body: { reason: 'not-found' } });

/** The Frogs' claim on Bob, made by Alice at NOW. */
const FROGS_CLAIM = Object.freeze({
  squadId: FROGS.id,
  claimedBy: ALICE.id,
  claimedAt: Timestamp.fromDate(NOW),
});

describe('when someone who is not signed in', () => {
  it('claims, answers 401 signed-out', async ({ flow }) => {
    await expect(claim(flow)).resolves.toEqual({
      status: 401,
      body: { reason: 'signed-out' },
    });
  });

  it('releases, answers 401 signed-out', async ({ flow }) => {
    await expect(release(flow)).resolves.toEqual({
      status: 401,
      body: { reason: 'signed-out' },
    });
  });
});

describe('when a Frogs member claims a player', () => {
  it.beforeEach(({ flow }) => signIn(flow, ALICE, [FROGS_ROLE]));

  it('stores the claim and answers with the claimed player', async ({
    flow,
  }) => {
    await expect(claim(flow)).resolves.toEqual({
      status: 200,
      body: boardBob({
        squadId: FROGS.id,
        claimedBy: ALICE.id,
        claimedAt: NOW.toISOString(),
      }),
    });
    expect(flow.db.read(bobPath(EVENT_ID))).toEqual({
      ...BOB_FRU,
      claim: FROGS_CLAIM,
    });
  });

  it('tells a board open on the event that the player changed, once for a repeated claim', async ({
    flow,
  }) => {
    const changes = recordChanges(flow, EVENT_ID);

    await claim(flow);
    await claim(flow);

    expect(changes).toEqual([BOB_CHANGED]);
  });

  describe('and claims them again a minute later', () => {
    it('keeps the first claim and answers with it', async ({ flow }) => {
      await claim(flow);
      vi.setSystemTime(NOW.getTime() + 60_000);

      await expect(claim(flow)).resolves.toEqual({
        status: 200,
        body: boardBob({
          squadId: FROGS.id,
          claimedBy: ALICE.id,
          claimedAt: NOW.toISOString(),
        }),
      });
      expect(flow.db.read(bobPath(EVENT_ID))).toEqual({
        ...BOB_FRU,
        claim: FROGS_CLAIM,
      });
    });
  });

  describe('and releases them', () => {
    it.beforeEach(({ flow }) => claim(flow));

    it('removes the claim and answers with the unclaimed player', async ({
      flow,
    }) => {
      await expect(release(flow)).resolves.toEqual({
        status: 200,
        body: boardBob(null),
      });
      expect(flow.db.read(bobPath(EVENT_ID))).toEqual(BOB_FRU);
    });

    it('tells a board open on the event that the player changed, once for a repeated release', async ({
      flow,
    }) => {
      const changes = recordChanges(flow, EVENT_ID);

      await release(flow);
      await release(flow);

      expect(changes).toEqual([BOB_CHANGED]);
    });

    it('releases them with no request body', async ({ flow }) => {
      const { status, body } = await flow.http.delete(claimPath(EVENT_ID));

      expect({ status, body, stored: flow.db.read(bobPath(EVENT_ID)) }).toEqual(
        { status: 200, body: boardBob(null), stored: BOB_FRU },
      );
    });

    it('answers a second release with the unclaimed player', async ({
      flow,
    }) => {
      await release(flow);

      await expect(release(flow)).resolves.toEqual({
        status: 200,
        body: boardBob(null),
      });
      expect(flow.db.read(bobPath(EVENT_ID))).toEqual(BOB_FRU);
    });
  });

  it('claims on an event whose sign-ups have closed', async ({ flow }) => {
    await expect(
      claim(flow, claimPath(SIGNUPS_CLOSED_EVENT_ID)),
    ).resolves.toEqual({
      status: 200,
      body: boardBob({
        squadId: FROGS.id,
        claimedBy: ALICE.id,
        claimedAt: NOW.toISOString(),
      }),
    });
    expect(flow.db.read(bobPath(SIGNUPS_CLOSED_EVENT_ID))).toEqual({
      ...BOB_FRU,
      claim: FROGS_CLAIM,
    });
  });

  it('answers a closed event 409 closed and leaves the player', async ({
    flow,
  }) => {
    await expect(claim(flow, claimPath(CLOSED_EVENT_ID))).resolves.toEqual({
      status: 409,
      body: { reason: 'closed' },
    });
    expect(flow.db.read(bobPath(CLOSED_EVENT_ID))).toEqual(BOB_FRU);
  });

  it('answers a withdrawn player 404 not-found and stores nothing', async ({
    flow,
  }) => {
    const carol = `${CAROL_ID}-${Encounter.FRU}`;

    await expect(claim(flow, claimPath(EVENT_ID, carol))).resolves.toEqual(
      NOT_FOUND,
    );
    expect(
      flow.db.read(`events/${EVENT_ID}/participants/${carol}`),
    ).toBeUndefined();
  });

  it("answers another guild's event 404 not-found and leaves the player", async ({
    flow,
  }) => {
    await expect(claim(flow, claimPath(OTHER_GUILD_EVENT_ID))).resolves.toEqual(
      NOT_FOUND,
    );
    expect(flow.db.read(bobPath(OTHER_GUILD_EVENT_ID))).toEqual(BOB_FRU);
  });

  it('answers an unknown event 404 not-found', async ({ flow }) => {
    await expect(claim(flow, claimPath('no-such-night'))).resolves.toEqual(
      NOT_FOUND,
    );
  });

  it.for([
    ['an event id of ..', claimPath('%2E%2E')],
    ['a participant id of ..', claimPath(EVENT_ID, '%2E%2E')],
    ['a participant id with a slash', claimPath(EVENT_ID, `${BOB.id}%2FFRU`)],
    ['a participant id with no encounter', claimPath(EVENT_ID, BOB.id)],
  ])('answers %s 404 not-found', async ([, path], { flow }) => {
    await expect(claim(flow, path)).resolves.toEqual(NOT_FOUND);
  });

  it('answers a form post 415 json-required and leaves the player', async ({
    flow,
  }) => {
    const { status, body } = await flow.http
      .post(claimPath(EVENT_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('squad=frg');

    expect({ status, body }).toEqual({
      status: 415,
      body: { reason: 'json-required' },
    });
    expect(flow.db.read(bobPath(EVENT_ID))).toEqual(BOB_FRU);
  });
});

describe('when the Owls have claimed the player', () => {
  it.beforeEach(async ({ flow }) => {
    flow.db.seed(bobPath(EVENT_ID), { ...BOB_FRU, claim: OWLS_CLAIM });
    await signIn(flow, ALICE, [FROGS_ROLE]);
  });

  it("answers a Frogs claim 409 with the Owls' claim and keeps it", async ({
    flow,
  }) => {
    await expect(claim(flow)).resolves.toEqual({
      status: 409,
      body: {
        reason: 'claimed',
        claim: {
          squadId: OWLS.id,
          claimedBy: DAVE.id,
          claimedAt: '2026-10-08T09:30:00.000Z',
        },
      },
    });
    expect(flow.db.read(bobPath(EVENT_ID))).toEqual({
      ...BOB_FRU,
      claim: OWLS_CLAIM,
    });
  });

  it('answers a Frogs release 403 not-your-claim and keeps it', async ({
    flow,
  }) => {
    await expect(release(flow)).resolves.toEqual({
      status: 403,
      body: { reason: 'not-your-claim' },
    });
    expect(flow.db.read(bobPath(EVENT_ID))).toEqual({
      ...BOB_FRU,
      claim: OWLS_CLAIM,
    });
  });
});

describe('when the Owls have claimed the player and an admin then removes the Owls', () => {
  it.beforeEach(async ({ flow }) => {
    flow.db.seed(bobPath(EVENT_ID), { ...BOB_FRU, claim: OWLS_CLAIM });
    flow.discord.addMember(ADMIN);
    flow.discord.command({
      userId: ADMIN.id,
      guildId: GUILD,
      commandName: 'settings',
      subcommand: 'squad-remove',
      options: { squad: OWLS.id },
    });
    await flow.settle();
    await signIn(flow, ALICE, [FROGS_ROLE]);
  });

  it('shows the player unclaimed on the board', async ({ flow }) => {
    const { status, body } = await flow.http.get(`/api/events/${EVENT_ID}`);

    expect({ status, body }).toEqual({
      status: 200,
      body: {
        id: EVENT_ID,
        title: 'FRU prog night',
        startsAt: '2026-10-12T20:00:00.000Z',
        signupsCloseAt: '2026-10-12T18:00:00.000Z',
        status: 'open',
        encounters: [{ id: Encounter.FRU, name: '[FRU] Futures Rewritten' }],
        participants: [boardBob(null)],
        squads: [{ id: FROGS.id, name: 'Frogs', tag: 'FRG', color: '#16a34a' }],
      },
    });
  });

  it('lets the Frogs claim them', async ({ flow }) => {
    await expect(claim(flow)).resolves.toEqual({
      status: 200,
      body: boardBob({
        squadId: FROGS.id,
        claimedBy: ALICE.id,
        claimedAt: NOW.toISOString(),
      }),
    });
    expect(flow.db.read(bobPath(EVENT_ID))).toEqual({
      ...BOB_FRU,
      claim: FROGS_CLAIM,
    });
  });

  it('answers a Frogs release with the unclaimed player', async ({ flow }) => {
    await expect(release(flow)).resolves.toEqual({
      status: 200,
      body: boardBob(null),
    });
  });
});

describe('when a Frogs member and an Owls member claim the same player at once', () => {
  it('gives the player to one squad and answers the other 409', async ({
    flow,
  }) => {
    const owls = flow.agent();
    await signIn(flow, ALICE, [FROGS_ROLE]);
    await signIn(flow, DAVE, [OWLS_ROLE], owls);

    const [frogs, other] = await Promise.all([
      claim(flow),
      claim(flow, claimPath(EVENT_ID), owls),
    ]);

    const winner =
      frogs.status === 200
        ? { squadId: FROGS.id, claimedBy: ALICE.id }
        : { squadId: OWLS.id, claimedBy: DAVE.id };
    const claimed = { ...winner, claimedAt: NOW.toISOString() };
    expect({
      responses: [frogs, other].sort((a, b) => a.status - b.status),
      stored: flow.db.read(bobPath(EVENT_ID)),
    }).toEqual({
      responses: [
        { status: 200, body: boardBob(claimed) },
        { status: 409, body: { reason: 'claimed', claim: claimed } },
      ],
      stored: {
        ...BOB_FRU,
        claim: { ...winner, claimedAt: Timestamp.fromDate(NOW) },
      },
    });
  });
});

describe('when a viewer claims a player', () => {
  it.beforeEach(({ flow }) => signIn(flow, ALICE, [VIEWER_ROLE]));

  it('answers 403 no-squad and leaves the player', async ({ flow }) => {
    await expect(claim(flow)).resolves.toEqual({
      status: 403,
      body: { reason: 'no-squad' },
    });
    expect(flow.db.read(bobPath(EVENT_ID))).toEqual(BOB_FRU);
  });
});

describe('when a member of two squads claims a player', () => {
  it.beforeEach(({ flow }) => signIn(flow, ALICE, [FROGS_ROLE, OWLS_ROLE]));

  it('answers 403 squad-conflict and leaves the player', async ({ flow }) => {
    await expect(claim(flow)).resolves.toEqual({
      status: 403,
      body: { reason: 'squad-conflict' },
    });
    expect(flow.db.read(bobPath(EVENT_ID))).toEqual(BOB_FRU);
  });
});
