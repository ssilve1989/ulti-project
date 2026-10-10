import { Encounter, PartyStatus, SignupStatus } from '@ulti-project/shared';
import { PermissionFlagsBits } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect, vi } from 'vitest';
import { EventMessageService } from '../../events/event-message.service.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type { EventPhase } from '../../firebase/models/event.model.js';
import { rosterDocId } from '../../firebase/models/roster.model.js';
import { shown } from '../../test-utils/discord/fake-message.js';
import { eventButtonRow, recordChanges } from '../../test-utils/events.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import {
  raidHelperPayload,
  serveRaidHelperEvent,
  serveRaidHelperFailure,
} from '../../test-utils/raid-helper.js';
import {
  commandErrorReply,
  expectCommandErrorReported,
  textReply,
} from '../../test-utils/replies.js';
import { seedSignup } from '../../test-utils/signups.js';

const GUILD = 'guild-1';
const EVENTS_CHANNEL = 'events-channel';
const MOD_CHANNEL = 'mod-channel';
const RAID_HELPER_ID = '1558267863758938215';
const EVENT_ID = `raid-helper-${RAID_HELPER_ID}`;
const ADMIN = Object.freeze({
  id: '100000000000000000',
  username: 'admin',
  permissions: PermissionFlagsBits.Administrator,
});
/** On Raid-Helper as a regen healer, with a reviewed DMU signup and a DMU prog-point role. */
const ALICE = Object.freeze({
  id: '100000000000000001',
  username: 'alice',
  roles: ['dmu-p2'],
});
/** Reviewed DMU signup, but no prog-point role. */
const BOB = Object.freeze({ id: '100000000000000002', username: 'bob' });
/** In the server, prog-point role, but no reviewed signup (hers is pending). */
const CAROL = Object.freeze({
  id: '100000000000000003',
  username: 'carol',
  roles: ['dmu-p2'],
});
/** On Raid-Helper, not in the server. */
const DAN_ID = '100000000000000004';

const TITLE = 'Ulti Project: Kefka - Saturday - Prog/Clear Parties';
const NOW = new Date('2026-10-07T16:00:00Z');
const START = new Date('2026-10-10T18:00:00Z');
const CLOSE = new Date('2026-10-10T16:00:00Z');
const seconds = (date: Date) => date.getTime() / 1000;
const START_S = seconds(START);
const ENTRY = seconds(new Date('2026-10-06T12:00:00Z'));
const PHASE: EventPhase = {
  roleId: 'dmu-p2',
  label: 'dmu-p2',
  order: 1,
  bucket: 'prog',
};

/** Boots the app at NOW, with the guild's members, prog-point role and signups. */
async function startFlow(): Promise<FlowApp> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    // it intercepts Raid-Helper, which a recording run would ask for real
    const flow = await createFlowApp({ replayOnly: true });
    flow.discord.addChannel(GUILD, EVENTS_CHANNEL);
    flow.discord.addChannel(GUILD, MOD_CHANNEL);
    flow.discord.addRole(GUILD, { id: 'dmu-p2', name: 'dmu-p2' });
    for (const member of [ADMIN, ALICE, BOB, CAROL]) {
      flow.discord.addMember(member);
    }
    flow.db.seed(`settings/${GUILD}`, {
      progPointRoles: { DMU: { P2: 'dmu-p2' } },
    });
    flow.db.seed(`encounters/${Encounter.DMU}/prog-points/P2`, {
      id: 'P2',
      label: 'P2',
      partyStatus: PartyStatus.ProgParty,
      order: 1,
      active: true,
    });
    const signup = { encounter: Encounter.DMU, world: 'gilgamesh' };
    seedSignup(flow, {
      ...signup,
      status: SignupStatus.APPROVED,
      discordId: ALICE.id,
      username: ALICE.username,
      character: ALICE.username,
    });
    seedSignup(flow, {
      ...signup,
      status: SignupStatus.UPDATE_PENDING,
      discordId: BOB.id,
      username: BOB.username,
      character: BOB.username,
    });
    seedSignup(flow, {
      ...signup,
      status: SignupStatus.PENDING,
      discordId: CAROL.id,
      username: CAROL.username,
      character: CAROL.username,
    });
    return flow;
  } catch (error) {
    vi.useRealTimers();
    throw error;
  }
}

async function stopFlow(flow: FlowApp): Promise<void> {
  try {
    await flow.close();
  } finally {
    vi.useRealTimers();
  }
}

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(() => startFlow(), stopFlow),
});

/** Raid-Helper's event: Alice, Bob, Carol, Dan, a tentative Erin, a `{Guest}` entry, and Fay on a spec the template doesn't have. */
const SIGN_UPS = [
  {
    userId: ALICE.id,
    name: 'Alice',
    specName: 'regenhealers',
    entryTime: ENTRY,
  },
  { userId: BOB.id, name: 'Bob', specName: 'Melee', entryTime: ENTRY },
  { userId: CAROL.id, name: 'Carol', specName: 'Caster', entryTime: ENTRY },
  { userId: DAN_ID, name: 'Dan', specName: 'Ranged', entryTime: ENTRY },
  {
    userId: '100000000000000005',
    name: 'Erin',
    className: 'Tentative',
    entryTime: ENTRY,
  },
  { userId: '{Guest}', name: '{Guest}', specName: 'Tank', entryTime: ENTRY },
  {
    userId: '100000000000000006',
    name: 'Fay',
    specName: 'Healer',
    entryTime: ENTRY,
  },
];

const payload = (
  overrides: Partial<Parameters<typeof raidHelperPayload>[0]> = {},
) =>
  raidHelperPayload({
    id: RAID_HELPER_ID,
    serverId: GUILD,
    title: TITLE,
    startTime: START_S,
    closingTime: seconds(CLOSE),
    signUps: SIGN_UPS,
    ...overrides,
  });

/** The admin runs `/event sync`, and the bot finishes with it. */
async function sync(
  flow: FlowApp,
  raidHelperId = RAID_HELPER_ID,
  options: { post?: boolean } = {},
) {
  flow.discord.command({
    userId: ADMIN.id,
    guildId: GUILD,
    channelId: EVENTS_CHANNEL,
    commandName: 'event',
    subcommand: 'sync',
    options: { 'raid-helper-id': raidHelperId, ...options },
  });
  await flow.settle();
}

/** The admin's latest reply: the panel of the command they ran last. */
function panel(flow: FlowApp) {
  const reply = flow.discord.repliesTo(ADMIN.id).at(-1);
  if (!reply) throw new Error('expected the admin to have a reply');
  return reply;
}

/** The admin picks DMU in the panel and posts. */
async function post(flow: FlowApp) {
  flow.discord.choose(panel(flow), [Encounter.DMU], ADMIN.id);
  await flow.settle();
  flow.discord.click(panel(flow), 'eventPost', ADMIN.id);
  await flow.settle();
}

const lastReply = (flow: FlowApp) => shown(panel(flow));
const privately = (content: string) =>
  textReply(ADMIN.id, content, { ephemeral: true });

const postUrl = (flow: FlowApp) => {
  const [message] = flow.discord.channel(EVENTS_CHANNEL);
  if (!message) throw new Error('nothing was posted');
  return `https://discord.com/channels/${GUILD}/${EVENTS_CHANNEL}/${message.id}`;
};

const CLAIM = Object.freeze({
  squadId: 'squad-1',
  claimedBy: ADMIN.id,
  claimedAt: Timestamp.fromDate(NOW),
});

const FROGS = Object.freeze({
  name: 'Frogs',
  tag: 'FRG',
  color: '#16a34a',
  roleId: 'frogs-role',
});

/** The guild's moderation channel and a squad, set as an admin would. */
const configureModeration = (flow: FlowApp) =>
  flow.get(SettingsCollection).upsert(GUILD, {
    autoModChannelId: MOD_CHANNEL,
    squads: { [CLAIM.squadId]: FROGS },
  });

const moderationChannel = (flow: FlowApp) =>
  flow.discord.channel(MOD_CHANNEL).map(shown);

/** Our event for the Raid-Helper event, as a first sync left it: posted, with Alice synced and Bob signed up with the button. */
async function seedSyncedEvent(flow: FlowApp, { closed = false } = {}) {
  const event = await flow.get(EventsCollection).createIfAbsent(EVENT_ID, {
    guildId: GUILD,
    title: TITLE,
    startsAt: Timestamp.fromDate(START),
    signupsCloseAt: Timestamp.fromDate(CLOSE),
    encounters: [Encounter.DMU],
    channelId: EVENTS_CHANNEL,
    createdBy: ADMIN.id,
  });
  await flow.get(EventMessageService).post(event);
  flow.db.seed(`events/${EVENT_ID}/participants/${ALICE.id}-DMU`, {
    discordId: ALICE.id,
    encounter: Encounter.DMU,
    role: 'melee',
    source: 'raid-helper',
    character: 'alice',
    world: 'gilgamesh',
    phase: PHASE,
    signedUpAt: Timestamp.fromMillis(ENTRY * 1000),
  });
  flow.db.seed(`events/${EVENT_ID}/participants/${BOB.id}-DMU`, BOB_BUTTON);
  if (closed) await flow.get(EventsCollection).close(EVENT_ID);
}

/** Bob's sign-up with the button. */
const BOB_BUTTON = Object.freeze({
  discordId: BOB.id,
  encounter: Encounter.DMU,
  job: 'WAR',
  character: 'bob',
  world: 'gilgamesh',
  phase: PHASE,
  signedUpAt: Timestamp.fromMillis(ENTRY * 1000),
});

/** The event's post after a first sync: Alice, by role. */
const ALICE_POST = Object.freeze({
  location: {
    kind: 'channel',
    guildId: GUILD,
    channelId: EVENTS_CHANNEL,
  },
  content: undefined,
  embeds: [
    {
      title: TITLE,
      description: [
        `<t:${START_S}:F> (<t:${START_S}:R>)`,
        `Sign-ups close <t:${seconds(CLOSE)}:R>`,
        `Organized by <@${ADMIN.id}>`,
      ].join('\n'),
      fields: [
        { name: '__Dancing Mad (Ultimate)__', value: '1 signed up' },
        {
          name: 'dmu-p2 (1)',
          value: `\`Regen\` <@${ALICE.id}> Alice@Gilgamesh`,
        },
      ],
    },
  ],
  components: [eventButtonRow(EVENT_ID, { signup: true })],
  reactions: {},
  deleted: false,
});

const SKIPPED = [
  'Skipped:',
  '- Bob: no prog-point role',
  '- Carol: no reviewed sign-up',
  '- Dan: not in the server',
  '- Erin: not attending',
  '- {Guest}: not in the server',
  '- Fay: job not recognised',
];

describe('/event sync', () => {
  describe('the first time an admin syncs a Raid-Helper event', () => {
    it.beforeEach(async ({ flow }) => {
      serveRaidHelperEvent(payload());
      await sync(flow);
      await post(flow);
    });

    it('stores the event from Raid-Helper, with sign-ups closing at its closing time', ({
      flow,
    }) => {
      expect(flow.db.read(`events/${EVENT_ID}`)).toEqual({
        guildId: GUILD,
        title: TITLE,
        startsAt: Timestamp.fromDate(START),
        signupsCloseAt: Timestamp.fromDate(CLOSE),
        signupsCloseDueAt: Timestamp.fromDate(CLOSE),
        encounters: [Encounter.DMU],
        channelId: EVENTS_CHANNEL,
        messageId: expect.any(String),
        createdBy: ADMIN.id,
        status: 'open',
      });
    });

    it('signs up only the members it can match, with their role', ({
      flow,
    }) => {
      expect(
        flow.db
          .documentsIn(`events/${EVENT_ID}/participants`)
          .map(({ id, data }) => ({ id, data })),
      ).toEqual([
        {
          id: `${ALICE.id}-DMU`,
          data: {
            discordId: ALICE.id,
            encounter: Encounter.DMU,
            role: 'regen',
            source: 'raid-helper',
            character: 'alice',
            world: 'gilgamesh',
            phase: PHASE,
            signedUpAt: Timestamp.fromMillis(ENTRY * 1000),
          },
        },
      ]);
    });

    it('shows them on the post by role', ({ flow }) => {
      expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
        ALICE_POST,
      ]);
    });

    it('tells the admin what it added and whom it skipped, and why', ({
      flow,
    }) => {
      expect(lastReply(flow)).toEqual(
        privately(
          [
            `Synced **${TITLE}**: ${postUrl(flow)}`,
            'Added 1 · Updated 0 · Removed 0',
            '',
            ...SKIPPED,
          ].join('\n'),
        ),
      );
    });
  });

  describe('when an admin syncs a Raid-Helper event without posting it', () => {
    it.beforeEach(async ({ flow }) => {
      serveRaidHelperEvent(payload());
      await sync(flow, RAID_HELPER_ID, { post: false });
      await post(flow);
    });

    it('stores the event and its sign-ups but posts nothing', ({ flow }) => {
      expect({
        event: flow.db.read(`events/${EVENT_ID}`),
        participants: flow.db
          .documentsIn(`events/${EVENT_ID}/participants`)
          .map(({ id }) => id),
        posts: flow.discord.channel(EVENTS_CHANNEL),
        reply: lastReply(flow),
      }).toEqual({
        event: {
          guildId: GUILD,
          title: TITLE,
          startsAt: Timestamp.fromDate(START),
          signupsCloseAt: Timestamp.fromDate(CLOSE),
          signupsCloseDueAt: Timestamp.fromDate(CLOSE),
          encounters: [Encounter.DMU],
          channelId: EVENTS_CHANNEL,
          createdBy: ADMIN.id,
          status: 'open',
        },
        participants: [`${ALICE.id}-DMU`],
        posts: [],
        reply: privately(
          [
            `Synced **${TITLE}** (not posted in Discord)`,
            'Added 1 · Updated 0 · Removed 0',
            '',
            ...SKIPPED,
          ].join('\n'),
        ),
      });
    });

    it('posts it when an admin syncs it again', async ({ flow }) => {
      serveRaidHelperEvent(payload());
      await sync(flow);

      expect({
        posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
        reply: lastReply(flow),
      }).toEqual({
        posts: [ALICE_POST],
        reply: privately(
          [
            `Synced **${TITLE}**: ${postUrl(flow)}`,
            'Added 0 · Updated 1 · Removed 0',
            '',
            ...SKIPPED,
          ].join('\n'),
        ),
      });
    });
  });

  it("closes sign-ups when the event starts if Raid-Helper's closing time is after that", async ({
    flow,
  }) => {
    serveRaidHelperEvent(payload({ closingTime: START_S + 3600 }));
    await sync(flow);
    await post(flow);

    expect(flow.db.read(`events/${EVENT_ID}`)).toEqual({
      guildId: GUILD,
      title: TITLE,
      startsAt: Timestamp.fromDate(START),
      signupsCloseAt: Timestamp.fromDate(START),
      signupsCloseDueAt: Timestamp.fromDate(START),
      encounters: [Encounter.DMU],
      channelId: EVENTS_CHANNEL,
      messageId: expect.any(String),
      createdBy: ADMIN.id,
      status: 'open',
    });
  });

  describe('when an admin syncs it again', () => {
    it('updates who is still on Raid-Helper and leaves button sign-ups alone, without asking for encounters', async ({
      flow,
    }) => {
      await seedSyncedEvent(flow);
      // with the role, Bob would match: only his button sign-up keeps Raid-Helper off it
      flow.discord.addMember({ ...BOB, roles: ['dmu-p2'] });
      const changes = recordChanges(flow, EVENT_ID);
      serveRaidHelperEvent(
        payload({
          signUps: [
            {
              userId: ALICE.id,
              name: 'Alice',
              specName: 'regenhealers',
              entryTime: ENTRY,
            },
            {
              userId: BOB.id,
              name: 'Bob',
              specName: 'Melee',
              entryTime: ENTRY,
            },
          ],
        }),
      );

      await sync(flow);

      expect({
        participants: flow.db
          .documentsIn(`events/${EVENT_ID}/participants`)
          .map(({ data }) => data),
        changes,
        reply: lastReply(flow),
      }).toEqual({
        participants: [
          {
            discordId: ALICE.id,
            encounter: Encounter.DMU,
            role: 'regen',
            source: 'raid-helper',
            character: 'alice',
            world: 'gilgamesh',
            phase: PHASE,
            signedUpAt: Timestamp.fromMillis(ENTRY * 1000),
          },
          BOB_BUTTON,
        ],
        changes: [
          {
            kind: 'participant',
            eventId: EVENT_ID,
            participantId: `${ALICE.id}-DMU`,
          },
        ],
        reply: privately(
          [
            `Synced **${TITLE}**: ${postUrl(flow)}`,
            'Added 0 · Updated 1 · Removed 0',
          ].join('\n'),
        ),
      });
    });

    it('tells open boards nothing about a synced player Raid-Helper still lists unchanged', async ({
      flow,
    }) => {
      await seedSyncedEvent(flow);
      const changes = recordChanges(flow, EVENT_ID);
      serveRaidHelperEvent(
        payload({
          signUps: [
            {
              userId: ALICE.id,
              name: 'Alice',
              specName: 'Melee',
              entryTime: ENTRY,
            },
          ],
        }),
      );

      await sync(flow);

      expect({ changes, reply: lastReply(flow) }).toEqual({
        changes: [],
        reply: privately(
          [
            `Synced **${TITLE}**: ${postUrl(flow)}`,
            'Added 0 · Updated 1 · Removed 0',
          ].join('\n'),
        ),
      });
    });

    it("removes a synced player who left Raid-Helper, takes them off their squad's roster, and alerts the moderators", async ({
      flow,
    }) => {
      await seedSyncedEvent(flow);
      await configureModeration(flow);
      const alicePath = `events/${EVENT_ID}/participants/${ALICE.id}-DMU`;
      flow.db.seed(alicePath, { ...flow.db.read(alicePath), claim: CLAIM });
      const rosterPath = `events/${EVENT_ID}/rosters/${rosterDocId(Encounter.DMU, CLAIM.squadId)}`;
      const roster = {
        guildId: GUILD,
        encounter: Encounter.DMU,
        squadId: CLAIM.squadId,
      };
      flow.db.seed(rosterPath, {
        ...roster,
        teams: [
          {
            id: 'team-a',
            slots: {
              melee: {
                kind: 'progger',
                participantId: `${ALICE.id}-DMU`,
                discordId: ALICE.id,
              },
            },
          },
        ],
      });
      const changes = recordChanges(flow, EVENT_ID);
      serveRaidHelperEvent(payload({ signUps: [] }));

      await sync(flow);

      expect({
        alice: flow.db.read(alicePath),
        roster: flow.db.read(rosterPath),
        changes,
        reply: lastReply(flow),
        alerts: moderationChannel(flow),
      }).toEqual({
        alice: undefined,
        roster: { ...roster, teams: [{ id: 'team-a', slots: {} }] },
        changes: [
          {
            kind: 'participant',
            eventId: EVENT_ID,
            participantId: `${ALICE.id}-DMU`,
          },
          {
            kind: 'roster',
            eventId: EVENT_ID,
            encounter: Encounter.DMU,
            squadId: CLAIM.squadId,
          },
        ],
        reply: privately(
          [
            `Synced **${TITLE}**: ${postUrl(flow)}`,
            'Added 0 · Updated 0 · Removed 1',
          ].join('\n'),
        ),
        alerts: [
          {
            location: {
              kind: 'channel',
              guildId: GUILD,
              channelId: MOD_CHANNEL,
            },
            content: undefined,
            embeds: [
              {
                title: 'Claimed player left Raid-Helper',
                fields: [
                  { name: 'Player', value: `<@${ALICE.id}> Alice@Gilgamesh` },
                  { name: 'Job', value: 'Melee' },
                  { name: 'Phase', value: 'dmu-p2' },
                  {
                    name: 'Event',
                    value: `[${TITLE}](${postUrl(flow)}) · <t:${START_S}:F>`,
                  },
                  { name: 'Encounter', value: 'Dancing Mad (Ultimate)' },
                  { name: 'Squad', value: 'Frogs (FRG)' },
                  {
                    name: 'Claimed by',
                    value: `<@${ADMIN.id}> <t:${seconds(NOW)}:R>`,
                  },
                  { name: 'Withdrew', value: `<t:${seconds(NOW)}:R>` },
                ],
              },
            ],
            components: [],
            allowedMentions: { parse: [] },
            reactions: {},
            deleted: false,
          },
        ],
      });
    });

    it("keeps a synced player whose Raid-Helper spec it doesn't recognise", async ({
      flow,
    }) => {
      await seedSyncedEvent(flow);
      await configureModeration(flow);
      const alicePath = `events/${EVENT_ID}/participants/${ALICE.id}-DMU`;
      const alice = { ...flow.db.read(alicePath), claim: CLAIM };
      flow.db.seed(alicePath, alice);
      serveRaidHelperEvent(
        payload({
          signUps: [
            {
              userId: ALICE.id,
              name: 'Alice',
              specName: 'Healer',
              entryTime: ENTRY,
            },
          ],
        }),
      );

      await sync(flow);

      expect({
        alice: flow.db.read(alicePath),
        reply: lastReply(flow),
        alerts: moderationChannel(flow),
      }).toEqual({
        alice,
        reply: privately(
          [
            `Synced **${TITLE}**: ${postUrl(flow)}`,
            'Added 0 · Updated 0 · Removed 0',
            '',
            'Skipped:',
            '- Alice: job not recognised',
          ].join('\n'),
        ),
        alerts: [],
      });
    });

    it('refuses a closed event', async ({ flow }) => {
      await seedSyncedEvent(flow, { closed: true });
      serveRaidHelperEvent(payload());

      await sync(flow);

      expect(lastReply(flow)).toEqual(privately('This event is closed.'));
    });
  });

  describe('refuses, writing nothing,', () => {
    /** After `/event sync <raidHelperId>`: the admin's reply and the stored events. */
    async function refused(flow: FlowApp, raidHelperId = RAID_HELPER_ID) {
      await sync(flow, raidHelperId);
      return { reply: lastReply(flow), events: flow.db.documentsIn('events') };
    }

    it('an id that is not a Raid-Helper id', async ({ flow }) => {
      expect(await refused(flow, 'abc')).toEqual({
        reply: privately("That isn't a Raid-Helper event id."),
        events: [],
      });
    });

    it('an event Raid-Helper does not know', async ({ flow }) => {
      serveRaidHelperFailure(RAID_HELPER_ID, 404);
      expect(await refused(flow)).toEqual({
        reply: privately("I couldn't find that Raid-Helper event."),
        events: [],
      });
    });

    it("another server's event", async ({ flow }) => {
      serveRaidHelperEvent(payload({ serverId: 'guild-2' }));
      expect(await refused(flow)).toEqual({
        reply: privately('That Raid-Helper event belongs to another server.'),
        events: [],
      });
    });

    it('an event that has started', async ({ flow }) => {
      serveRaidHelperEvent(payload({ startTime: seconds(NOW) - 60 }));
      expect(await refused(flow)).toEqual({
        reply: privately('That Raid-Helper event has already started.'),
        events: [],
      });
    });
  });

  it('reports a Raid-Helper outage as the standard error, writing nothing', async ({
    flow,
  }) => {
    serveRaidHelperFailure(RAID_HELPER_ID, 500, { status: 'error' });
    await sync(flow);

    expectCommandErrorReported(flow, 'Raid-Helper answered 500');
    expect(lastReply(flow)).toEqual(commandErrorReply(flow, ADMIN.id));
    expect(flow.db.documentsIn('events')).toEqual([]);
  });
});
