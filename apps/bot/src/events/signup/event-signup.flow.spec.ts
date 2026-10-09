import { EventBus } from '@nestjs/cqrs';
import type * as Sentry from '@sentry/nestjs';
import {
  Encounter,
  JOB_NAME,
  JOBS,
  PartyStatus,
  SignupStatus,
} from '@ulti-project/shared';
import { ComponentType, TextInputStyle } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect, vi } from 'vitest';
import type { SquadConfig } from '../../board/squads.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type {
  EventPhase,
  ParticipantDocument,
} from '../../firebase/models/event.model.js';
import { EventSchedulerModule } from '../../jobs/event-scheduler/event-scheduler.module.js';
import {
  runTick,
  type SpiedCron,
  spiedCron,
} from '../../test-utils/cron-tick.js';
import { shown } from '../../test-utils/discord/fake-message.js';
import {
  type EventButtonsEnabled,
  eventButtonRow,
} from '../../test-utils/events.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import {
  commandErrorReply,
  expectCommandErrorReported,
  privateReply,
} from '../../test-utils/replies.js';
import { watchSentryMetrics } from '../../test-utils/sentry.js';
import { seedSignup } from '../../test-utils/signups.js';
import { EventMessageService } from '../event-message.service.js';
import { ParticipantWithdrawnEvent } from './events.events.js';

const GUILD = 'guild-1';
const EVENTS_CHANNEL = 'events-channel';
const MOD_CHANNEL = 'mod-channel';
const ORGANIZER_ROLE = 'organizer-role';
const ORGANIZER = Object.freeze({
  id: 'organizer-1',
  username: 'organizer',
  roles: [ORGANIZER_ROLE],
});
const ALICE = Object.freeze({
  id: 'alice',
  username: 'alice',
  roles: ['fru-p4'],
});
const BOB = Object.freeze({
  id: 'bob',
  username: 'bob',
  roles: ['fru-p3', 'top-p2'],
});
const CAROL = Object.freeze({ id: 'carol', username: 'carol' });
const SGE_EMOJI = 'sge-emoji';

const TITLE = 'FRU prog night';
const NOW = new Date('2026-10-07T16:00:00Z');
const START = new Date('2026-10-12T16:00:00Z');
const CLOSE = new Date('2026-10-12T14:00:00Z');
/** When a claimed member withdraws, a day after being claimed at NOW. */
const WITHDRAWN = new Date('2026-10-08T16:00:00Z');
/** A moment after sign-ups close at CLOSE. */
const AFTER_CLOSE = new Date(CLOSE.getTime() + 30_000);
const seconds = (date: Date) => date.getTime() / 1000;
const START_S = seconds(START);
const CLOSE_S = seconds(CLOSE);

const FRU = '[FRU] Futures Rewritten';
const TOP = '[TOP] The Omega Protocol';

const PHASES = Object.freeze({
  fruP3: { roleId: 'fru-p3', label: 'fru-p3', order: 2, bucket: 'prog' },
  fruP4: { roleId: 'fru-p4', label: 'fru-p4', order: 3, bucket: 'prog' },
  topP2: { roleId: 'top-p2', label: 'top-p2', order: 1, bucket: 'prog' },
} satisfies Record<string, EventPhase>);

const PROG_POINTS = Object.freeze([
  { encounter: Encounter.FRU, id: 'P3', order: 2 },
  { encounter: Encounter.FRU, id: 'P4', order: 3 },
  { encounter: Encounter.TOP, id: 'P2', order: 1 },
]);

/** Boots the app (with the event-scheduler job) at NOW, with the guild's roles, members and settings. */
async function startFlow(): Promise<FlowApp> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    const flow = await createFlowApp({ modules: [EventSchedulerModule] });
    flow.discord.addChannel(GUILD, EVENTS_CHANNEL);
    flow.discord.addChannel(GUILD, MOD_CHANNEL);
    flow.discord.addRole(GUILD, { id: ORGANIZER_ROLE, name: 'Organizer' });
    for (const role of ['fru-p3', 'fru-p4', 'fru-clear', 'top-p2']) {
      flow.discord.addRole(GUILD, { id: role, name: role });
    }
    flow.discord.addEmoji({ id: SGE_EMOJI, name: 'SGE' });
    for (const member of [ORGANIZER, ALICE, BOB, CAROL]) {
      flow.discord.addMember(member);
    }
    flow.db.seed(`settings/${GUILD}`, {
      eventOrganizerRoles: [ORGANIZER_ROLE],
      progPointRoles: {
        FRU: { P3: 'fru-p3', P4: 'fru-p4' },
        TOP: { P2: 'top-p2' },
      },
      clearRoles: { FRU: 'fru-clear' },
      jobEmojis: { SGE: SGE_EMOJI },
    });
    for (const { encounter, id, order } of PROG_POINTS) {
      flow.db.seed(`encounters/${encounter}/prog-points/${id}`, {
        id,
        label: id,
        partyStatus: PartyStatus.ProgParty,
        order,
        active: true,
      });
    }
    seedSignup(flow, {
      status: SignupStatus.APPROVED,
      discordId: ALICE.id,
      username: ALICE.username,
      encounter: Encounter.FRU,
      character: 'alice',
      world: 'gilgamesh',
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

/**
 * `cron.from` is spied before the app boots, so `runTick(cron.from)` runs the
 * event-scheduler's tick; `start` does nothing, so no real tick fires mid-test.
 */
const it = base.extend<{
  cron: SpiedCron;
  flow: FlowApp;
}>({
  cron: spiedCron(),
  flow: async ({ cron: _spiedBeforeBoot }, use) => {
    const flow = await startFlow();
    try {
      await use(flow);
    } finally {
      await stopFlow(flow);
    }
  },
});

function onlyEventId(flow: FlowApp): string {
  const [event, ...others] = flow.db.documentsIn('events');
  if (event === undefined || others.length > 0) {
    throw new Error('expected one event');
  }
  return event.id;
}

function eventPost(flow: FlowApp) {
  const [message] = flow.discord.channel(EVENTS_CHANNEL);
  if (!message) throw new Error(`nothing was posted in ${EVENTS_CHANNEL}`);
  return message;
}

/**
 * Posts the FRU + TOP event the way a schedule does, without a command, so no
 * interaction (or collector) is behind its message.
 */
async function postEvent(flow: FlowApp): Promise<void> {
  const event = await flow.get(EventsCollection).create({
    guildId: GUILD,
    title: TITLE,
    startsAt: Timestamp.fromDate(START),
    signupsCloseAt: Timestamp.fromDate(CLOSE),
    encounters: [Encounter.FRU, Encounter.TOP],
    channelId: EVENTS_CHANNEL,
    createdBy: ORGANIZER.id,
  });
  await flow.get(EventMessageService).post(event);
}

/** `userId` clicks the event's `action` button, and the bot finishes with it. */
async function click(
  flow: FlowApp,
  action: 'signup' | 'withdraw',
  userId: string,
) {
  flow.discord.click(
    eventPost(flow),
    `event:${action}:${onlyEventId(flow)}`,
    userId,
  );
  await flow.settle();
}

/** `userId`'s latest private reply that still has a select menu. */
function prompt(flow: FlowApp, userId: string) {
  const reply = flow.discord
    .repliesTo(userId)
    .findLast(
      (message) => message.componentsOfType(ComponentType.StringSelect).length,
    );
  if (!reply) throw new Error(`${userId} has no reply with a select menu`);
  return reply;
}

async function choose(flow: FlowApp, userId: string, value: string) {
  flow.discord.choose(prompt(flow, userId), value, userId);
  await flow.settle();
}

async function submit(
  flow: FlowApp,
  userId: string,
  fields: { character: string; world: string },
) {
  flow.discord.submitModal(userId, fields);
  await flow.settle();
}

/** alice signs up for FRU as SGE, using her approved signup. */
async function aliceSignsUp(flow: FlowApp) {
  await click(flow, 'signup', ALICE.id);
  await choose(flow, ALICE.id, 'SGE');
}

const replies = (flow: FlowApp, userId: string) =>
  flow.discord.repliesTo(userId).map(shown);

const privately = (userId: string, content: string) =>
  privateReply(userId, { content });

const participantsPath = (flow: FlowApp) =>
  `events/${onlyEventId(flow)}/participants`;

/** The stored participants, by document id. */
const participants = (flow: FlowApp) =>
  Object.fromEntries(
    flow.db
      .documentsIn(participantsPath(flow))
      .map(({ id, data }) => [id, data]),
  );

const ALICE_FRU: ParticipantDocument = Object.freeze({
  discordId: ALICE.id,
  encounter: Encounter.FRU,
  job: 'SGE',
  character: 'alice',
  world: 'gilgamesh',
  phase: PHASES.fruP4,
  signedUpAt: Timestamp.fromDate(NOW),
});

const BOB_TOP: ParticipantDocument = Object.freeze({
  discordId: BOB.id,
  encounter: Encounter.TOP,
  job: 'WAR',
  character: 'bob bobson',
  world: 'jenova',
  phase: PHASES.topP2,
  signedUpAt: Timestamp.fromDate(NOW),
});

const BOB_FRU: ParticipantDocument = Object.freeze({
  ...BOB_TOP,
  encounter: Encounter.FRU,
  phase: PHASES.fruP3,
});

const CLAIM = Object.freeze({
  squadId: 'squad-1',
  claimedBy: ORGANIZER.id,
  claimedAt: Timestamp.fromDate(NOW),
});

const FROGS = Object.freeze({
  name: 'Frogs',
  tag: 'FRG',
  color: '#16a34a',
  roleId: 'frogs-role',
});

/** The guild's moderation channel and squads, set as an admin would. */
const configureModeration = (
  flow: FlowApp,
  {
    channel = true,
    squads = { [CLAIM.squadId]: FROGS },
  }: { channel?: boolean; squads?: Record<string, SquadConfig> } = {},
) =>
  flow.get(SettingsCollection).upsert(GUILD, {
    ...(channel ? { autoModChannelId: MOD_CHANNEL } : {}),
    squads,
  });

/** What the moderation channel shows when alice's claimed FRU sign-up is withdrawn. */
const claimedAliceWithdrew = (
  flow: FlowApp,
  { squad = 'Frogs (FRG)' } = {},
) => ({
  location: { kind: 'channel', guildId: GUILD, channelId: MOD_CHANNEL },
  content: undefined,
  embeds: [
    {
      title: 'Claimed player withdrew',
      fields: [
        { name: 'Player', value: `<@${ALICE.id}> Alice@Gilgamesh` },
        { name: 'Job', value: `<:SGE:${SGE_EMOJI}> Sage` },
        { name: 'Phase', value: 'fru-p4' },
        {
          name: 'Event',
          value: `[${TITLE}](https://discord.com/channels/${GUILD}/${EVENTS_CHANNEL}/${eventPost(flow).id}) · <t:${START_S}:F>`,
        },
        { name: 'Encounter', value: FRU },
        { name: 'Squad', value: squad },
        {
          name: 'Claimed by',
          value: `<@${ORGANIZER.id}> <t:${seconds(NOW)}:R>`,
        },
        { name: 'Withdrew', value: `<t:${seconds(WITHDRAWN)}:R>` },
      ],
    },
  ],
  components: [],
  allowedMentions: { parse: [] },
  reactions: {},
  deleted: false,
});

const moderationChannel = (flow: FlowApp) =>
  flow.discord.channel(MOD_CHANNEL).map(shown);

const ALICE_LINE = `<:SGE:${SGE_EMOJI}> <@${ALICE.id}> Alice@Gilgamesh`;
const BOB_LINE = `\`WAR\` <@${BOB.id}> Bob Bobson@Jenova`;

/** An encounter's header field, with how many signed up. */
const encounterField = (name: string, count: number) => ({
  name: `__${name}__`,
  value: count ? `${count} signed up` : 'No sign-ups yet',
});

const NOBODY = Object.freeze([encounterField(FRU, 0), encounterField(TOP, 0)]);
const ALICE_SIGNED_UP = Object.freeze([
  encounterField(FRU, 1),
  { name: 'fru-p4 (1)', value: ALICE_LINE },
  encounterField(TOP, 0),
]);

/** The event's post as members see it. */
const eventMessage = (
  flow: FlowApp,
  fields: readonly object[],
  {
    signups = `Sign-ups close <t:${CLOSE_S}:R>`,
    buttons = { signup: true, withdraw: true },
  }: { signups?: string; buttons?: EventButtonsEnabled } = {},
) => ({
  location: { kind: 'channel', guildId: GUILD, channelId: EVENTS_CHANNEL },
  content: undefined,
  embeds: [
    {
      title: TITLE,
      description: [
        `<t:${START_S}:F> (<t:${START_S}:R>)`,
        signups,
        `Organized by <@${ORGANIZER.id}>`,
      ].join('\n'),
      fields,
    },
  ],
  components: [eventButtonRow(onlyEventId(flow), buttons)],
  reactions: {},
  deleted: false,
});

const posted = (flow: FlowApp) => shown(eventPost(flow));

const selectRow = (
  customId: string,
  placeholder: string,
  options: readonly object[],
) => ({
  type: ComponentType.ActionRow,
  components: [
    {
      type: ComponentType.StringSelect,
      custom_id: customId,
      placeholder,
      options,
    },
  ],
});

const JOB_PROMPT = (encounter: string) => ({
  content: `Pick your job for **${encounter}**.`,
  components: [
    selectRow(
      'eventSignupJob',
      'Your job',
      JOBS.map((job) => ({
        label: JOB_NAME[job],
        value: job,
        ...(job === 'SGE' && { emoji: { id: SGE_EMOJI } }),
      })),
    ),
  ],
});

const ENCOUNTER_PROMPT = Object.freeze({
  content: 'Which encounter are you signing up for?',
  components: [
    selectRow('eventSignupEncounter', 'Encounter', [
      { label: FRU, value: Encounter.FRU },
      { label: TOP, value: Encounter.TOP },
    ]),
  ],
});

const CHARACTER_MODAL = Object.freeze({
  // one per job pick, so a dismissed form's waiter can't take a later submit
  custom_id: expect.stringMatching(/^eventSignupCharacterModal-.+$/),
  title: 'Your character',
  components: [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.TextInput,
          custom_id: 'character',
          label: 'Character',
          style: TextInputStyle.Short,
          max_length: 64,
          required: true,
        },
      ],
    },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.TextInput,
          custom_id: 'world',
          label: 'World',
          style: TextInputStyle.Short,
          max_length: 32,
          required: true,
        },
      ],
    },
  ],
});

const INVALID_WORLD =
  'Invalid World. Please check the spelling and make sure it is a valid world in the NA Region';
const SIGNUP_EXPIRED =
  'This sign-up expired. Click Sign up again if you still want to join.';

/** Every metric the app records while `act` runs. */
async function metricsDuring(act: () => Promise<void>) {
  const metrics: Sentry.Metric[] = [];
  const stop = watchSentryMetrics((metric) => metrics.push(metric));
  try {
    await act();
  } finally {
    stop();
  }
  return metrics;
}

/** The count of an `action` prompt `user` let expire; it carries the clicker, from the listener's scope. */
const expiredMetric = (
  action: 'signup' | 'withdraw',
  user: { id: string; username: string },
) => ({
  name: 'discord.prompt.expired',
  type: 'counter',
  value: 1,
  attributes: {
    component: `event:${action}`,
    'user.id': user.id,
    'user.name': user.username,
  },
});

describe('when an organizer posts an event', () => {
  it('shows members the Sign up and Withdraw buttons', async ({ flow }) => {
    flow.discord.command({
      userId: ORGANIZER.id,
      guildId: GUILD,
      channelId: EVENTS_CHANNEL,
      commandName: 'event',
      subcommand: 'create',
      options: {
        title: 'DMU prog night',
        start: `<t:${START_S}:F>`,
        'encounter-1': Encounter.DMU,
      },
    });
    await flow.settle();

    expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
      {
        location: {
          kind: 'channel',
          guildId: GUILD,
          channelId: EVENTS_CHANNEL,
        },
        content: undefined,
        embeds: [
          {
            title: 'DMU prog night',
            description: [
              `<t:${START_S}:F> (<t:${START_S}:R>)`,
              `Organized by <@${ORGANIZER.id}>`,
            ].join('\n'),
            fields: [
              { name: '__Dancing Mad (Ultimate)__', value: 'No sign-ups yet' },
            ],
          },
        ],
        components: [
          eventButtonRow(onlyEventId(flow), { signup: true, withdraw: true }),
        ],
        reactions: {},
        deleted: false,
      },
    ]);
  });
});

describe('Sign up', () => {
  it.beforeEach(({ flow }) => postEvent(flow));

  describe('when a member eligible for one encounter has an approved signup', () => {
    it('asks only for their job', async ({ flow }) => {
      await click(flow, 'signup', ALICE.id);

      expect(replies(flow, ALICE.id)).toEqual([
        privateReply(ALICE.id, JOB_PROMPT(FRU)),
      ]);
    });

    describe('and picks a job', () => {
      it.beforeEach(({ flow }) => aliceSignsUp(flow));

      it('confirms it, privately', ({ flow }) => {
        expect(replies(flow, ALICE.id)).toEqual([
          privately(
            ALICE.id,
            `You're signed up for **${FRU}** as <:SGE:${SGE_EMOJI}> Sage.`,
          ),
        ]);
      });

      it('stores them with their signup character and phase', ({ flow }) => {
        expect(participants(flow)).toEqual({ 'alice-FRU': ALICE_FRU });
      });

      it('lists them in the post', ({ flow }) => {
        expect(posted(flow)).toEqual(eventMessage(flow, ALICE_SIGNED_UP));
      });

      it('keeps the confirmation once the prompt would have expired', async ({
        flow,
      }) => {
        const metrics = await metricsDuring(async () => {
          flow.discord.expireAll();
          await flow.settle();
        });

        expect({ replies: replies(flow, ALICE.id), metrics }).toEqual({
          replies: [
            privately(
              ALICE.id,
              `You're signed up for **${FRU}** as <:SGE:${SGE_EMOJI}> Sage.`,
            ),
          ],
          metrics: [],
        });
      });
    });

    describe('and signs up again as another job after being claimed', () => {
      it.beforeEach(async ({ flow }) => {
        await aliceSignsUp(flow);
        const path = `${participantsPath(flow)}/alice-FRU`;
        flow.db.seed(path, { ...flow.db.read(path), claim: CLAIM });
        vi.setSystemTime(new Date(NOW.getTime() + 60_000));
        await click(flow, 'signup', ALICE.id);
        await choose(flow, ALICE.id, 'WHM');
      });

      it('changes their job, keeping the claim and when they first signed up', ({
        flow,
      }) => {
        expect(participants(flow)).toEqual({
          'alice-FRU': { ...ALICE_FRU, job: 'WHM', claim: CLAIM },
        });
      });

      it('shows the new job in the post', ({ flow }) => {
        expect(posted(flow)).toEqual(
          eventMessage(flow, [
            encounterField(FRU, 1),
            {
              name: 'fru-p4 (1)',
              value: `\`WHM\` <@${ALICE.id}> Alice@Gilgamesh`,
            },
            encounterField(TOP, 0),
          ]),
        );
      });
    });
  });

  describe('when a member eligible for several encounters has no signup', () => {
    it.beforeEach(({ flow }) => click(flow, 'signup', BOB.id));

    it('asks which encounter', ({ flow }) => {
      expect(replies(flow, BOB.id)).toEqual([
        privateReply(BOB.id, ENCOUNTER_PROMPT),
      ]);
    });

    describe('and picks one, then a job', () => {
      it.beforeEach(async ({ flow }) => {
        await choose(flow, BOB.id, Encounter.TOP);
        await choose(flow, BOB.id, 'WAR');
      });

      it('asks for their character and world', ({ flow }) => {
        expect({
          replies: replies(flow, BOB.id),
          modals: flow.discord.modalsShownTo(BOB.id),
        }).toEqual({
          replies: [privateReply(BOB.id, JOB_PROMPT(TOP))],
          modals: [CHARACTER_MODAL],
        });
      });

      describe('and enters them', () => {
        it.beforeEach(({ flow }) =>
          submit(flow, BOB.id, { character: 'Bob Bobson', world: 'Jenova' }),
        );

        it('stores them with that character and their phase', ({ flow }) => {
          expect(participants(flow)).toEqual({ 'bob-TOP': BOB_TOP });
        });

        it('confirms it and lists them in the post', ({ flow }) => {
          expect({
            replies: replies(flow, BOB.id),
            post: posted(flow),
          }).toEqual({
            replies: [
              privately(
                BOB.id,
                `You're signed up for **${TOP}** as \`WAR\` Warrior.`,
              ),
            ],
            post: eventMessage(flow, [
              encounterField(FRU, 0),
              encounterField(TOP, 1),
              { name: 'top-p2 (1)', value: BOB_LINE },
            ]),
          });
        });
      });

      describe('and enters a world that is not in NA', () => {
        it.beforeEach(({ flow }) =>
          submit(flow, BOB.id, { character: 'Bob Bobson', world: 'Atlantis' }),
        );

        it('tells them why above a fresh job prompt, and stores nothing', ({
          flow,
        }) => {
          expect({
            replies: replies(flow, BOB.id),
            participants: participants(flow),
          }).toEqual({
            replies: [
              privateReply(BOB.id, {
                content: `${INVALID_WORLD}\n\n${JOB_PROMPT(TOP).content}`,
                components: JOB_PROMPT(TOP).components,
              }),
            ],
            participants: {},
          });
        });

        it('lets them pick the same job and try again', async ({ flow }) => {
          await choose(flow, BOB.id, 'WAR');
          await submit(flow, BOB.id, {
            character: 'Bob Bobson',
            world: 'Jenova',
          });

          expect({
            replies: replies(flow, BOB.id),
            participants: participants(flow),
          }).toEqual({
            replies: [
              privately(
                BOB.id,
                `You're signed up for **${TOP}** as \`WAR\` Warrior.`,
              ),
            ],
            participants: { 'bob-TOP': BOB_TOP },
          });
        });
      });

      describe('and closes the form, then picks another job and submits', () => {
        it('stores only the second job', async ({ flow }) => {
          await choose(flow, BOB.id, 'WHM');
          await submit(flow, BOB.id, {
            character: 'Bob Bobson',
            world: 'Jenova',
          });

          expect(participants(flow)).toEqual({
            'bob-TOP': { ...BOB_TOP, job: 'WHM' },
          });
        });
      });

      describe('and closes the character form', () => {
        it('lets the prompt expire without an error', async ({ flow }) => {
          const metrics = await metricsDuring(async () => {
            flow.discord.expireAll();
            await flow.settle();
          });

          expect({
            replies: replies(flow, BOB.id),
            participants: participants(flow),
            metrics,
          }).toEqual({
            replies: [privately(BOB.id, SIGNUP_EXPIRED)],
            participants: {},
            metrics: [expiredMetric('signup', BOB)],
          });
        });
      });
    });

    describe('and lets the encounter prompt expire', () => {
      it('says so, removes the menu and records it', async ({ flow }) => {
        const metrics = await metricsDuring(async () => {
          flow.discord.expireAll();
          await flow.settle();
        });

        expect({ replies: replies(flow, BOB.id), metrics }).toEqual({
          replies: [privately(BOB.id, SIGNUP_EXPIRED)],
          metrics: [expiredMetric('signup', BOB)],
        });
      });
    });
  });

  describe('when a member lets the job prompt expire', () => {
    it('says so, removes the menu and records it', async ({ flow }) => {
      await click(flow, 'signup', ALICE.id);

      const metrics = await metricsDuring(async () => {
        flow.discord.expireAll();
        await flow.settle();
      });

      expect({ replies: replies(flow, ALICE.id), metrics }).toEqual({
        replies: [privately(ALICE.id, SIGNUP_EXPIRED)],
        metrics: [expiredMetric('signup', ALICE)],
      });
    });
  });

  describe('when a member has no prog-point role for any encounter', () => {
    it('refuses, privately, and stores nothing', async ({ flow }) => {
      await click(flow, 'signup', CAROL.id);

      expect({
        replies: replies(flow, CAROL.id),
        participants: participants(flow),
      }).toEqual({
        replies: [
          privately(
            CAROL.id,
            `You need a prog-point role for ${FRU} or ${TOP} to sign up.`,
          ),
        ],
        participants: {},
      });
    });
  });

  describe('when the sign-up deadline has passed but the scheduler has not run', () => {
    it('refuses, privately, and stores nothing', async ({ flow }) => {
      vi.setSystemTime(AFTER_CLOSE);

      await click(flow, 'signup', ALICE.id);

      expect({
        replies: replies(flow, ALICE.id),
        participants: participants(flow),
      }).toEqual({
        replies: [
          privately(
            ALICE.id,
            `Sign-ups for this event closed <t:${CLOSE_S}:R>.`,
          ),
        ],
        participants: {},
      });
    });
  });

  describe('when the deadline passes while a member is picking a job', () => {
    it('refuses at the pick, and stores nothing', async ({ flow }) => {
      await click(flow, 'signup', ALICE.id);
      vi.setSystemTime(AFTER_CLOSE);
      await choose(flow, ALICE.id, 'SGE');

      expect({
        replies: replies(flow, ALICE.id),
        participants: participants(flow),
      }).toEqual({
        replies: [
          privately(
            ALICE.id,
            `Sign-ups for this event closed <t:${CLOSE_S}:R>.`,
          ),
        ],
        participants: {},
      });
    });
  });

  describe('when an organizer closes the event while a member is picking a job', () => {
    it('refuses at the pick, and stores nothing', async ({ flow }) => {
      await click(flow, 'signup', ALICE.id);
      flow.discord.command({
        userId: ORGANIZER.id,
        guildId: GUILD,
        channelId: EVENTS_CHANNEL,
        commandName: 'event',
        subcommand: 'close',
        options: { event: onlyEventId(flow) },
      });
      await flow.settle();
      await choose(flow, ALICE.id, 'SGE');

      expect({
        replies: replies(flow, ALICE.id),
        participants: participants(flow),
      }).toEqual({
        replies: [privately(ALICE.id, 'This event is closed.')],
        participants: {},
      });
    });
  });

  describe('when the bot has restarted since posting the event', () => {
    it('still answers the button, which no collector is listening to', async ({
      flow,
    }) => {
      // a restart drops every collector the bot had
      flow.discord.expireAll();
      const collecting = eventPost(flow).isCollected();

      await click(flow, 'signup', ALICE.id);

      expect({ collecting, replies: replies(flow, ALICE.id) }).toEqual({
        collecting: false,
        replies: [privateReply(ALICE.id, JOB_PROMPT(FRU))],
      });
    });
  });

  describe('when Firestore is unreachable', () => {
    it('shows the member the standard error, and reports it', async ({
      flow,
    }) => {
      const signup = `event:signup:${onlyEventId(flow)}`;
      flow.db.goOffline();

      flow.discord.click(eventPost(flow), signup, ALICE.id);
      await flow.settle();

      expectCommandErrorReported(flow, '14 UNAVAILABLE');
      expect(replies(flow, ALICE.id)).toEqual([
        commandErrorReply(flow, ALICE.id),
      ]);
    });
  });
});

describe('Withdraw', () => {
  it.beforeEach(({ flow }) => postEvent(flow));

  /** alice signs up for FRU, and a squad claims her. */
  async function aliceIsClaimed(flow: FlowApp) {
    await aliceSignsUp(flow);
    const path = `${participantsPath(flow)}/alice-FRU`;
    flow.db.seed(path, { ...flow.db.read(path), claim: CLAIM });
  }

  /** alice withdraws at WITHDRAWN. */
  async function aliceWithdraws(flow: FlowApp) {
    vi.setSystemTime(WITHDRAWN);
    await click(flow, 'withdraw', ALICE.id);
  }

  describe('when a member signed up for one encounter withdraws', () => {
    it.beforeEach(async ({ flow }) => {
      await configureModeration(flow);
      await aliceIsClaimed(flow);
    });

    it('removes them and tells the board they withdrew, claim included', async ({
      flow,
    }) => {
      const published: unknown[] = [];
      const subscription = flow
        .get(EventBus)
        .subscribe((event) => published.push(event));
      try {
        await click(flow, 'withdraw', ALICE.id);
      } finally {
        subscription.unsubscribe();
      }

      expect({ participants: participants(flow), published }).toEqual({
        participants: {},
        published: [
          new ParticipantWithdrawnEvent(
            onlyEventId(flow),
            { ...ALICE_FRU, claim: CLAIM, id: 'alice-FRU' },
            'withdrew',
          ),
        ],
      });
    });

    it('confirms it and takes them off the post', async ({ flow }) => {
      await click(flow, 'withdraw', ALICE.id);

      expect({
        replies: replies(flow, ALICE.id).at(-1),
        post: posted(flow),
      }).toEqual({
        replies: privately(ALICE.id, `You've withdrawn from **${FRU}**.`),
        post: eventMessage(flow, NOBODY),
      });
    });

    it('alerts the moderators that a claimed player withdrew', async ({
      flow,
    }) => {
      await aliceWithdraws(flow);

      expect(moderationChannel(flow)).toEqual([claimedAliceWithdrew(flow)]);
    });
  });

  describe('when a claimed member withdraws after their squad was deleted', () => {
    it("alerts the moderators with the squad's id", async ({ flow }) => {
      await configureModeration(flow, { squads: {} });
      await aliceIsClaimed(flow);

      await aliceWithdraws(flow);

      expect(moderationChannel(flow)).toEqual([
        claimedAliceWithdrew(flow, { squad: CLAIM.squadId }),
      ]);
    });
  });

  describe('when an unclaimed member withdraws', () => {
    it('alerts nobody', async ({ flow }) => {
      await configureModeration(flow);
      await aliceSignsUp(flow);

      await aliceWithdraws(flow);

      expect({
        participants: participants(flow),
        moderation: moderationChannel(flow),
      }).toEqual({ participants: {}, moderation: [] });
    });
  });

  describe('when a claimed member withdraws and no moderation channel is configured', () => {
    it('removes them, confirms it, and only logs that nobody was alerted', async ({
      flow,
    }) => {
      await configureModeration(flow, { channel: false });
      await aliceIsClaimed(flow);

      await aliceWithdraws(flow);

      expect({
        reply: replies(flow, ALICE.id).at(-1),
        participants: participants(flow),
        moderation: moderationChannel(flow),
      }).toEqual({
        reply: privately(ALICE.id, `You've withdrawn from **${FRU}**.`),
        participants: {},
        moderation: [],
      });
      flow.expectReported(/^warning: .*no moderation channel/s);
    });
  });

  describe("when a claimed member withdraws and the moderation channel can't be posted in", () => {
    it('removes them, confirms it, and only logs the failed alert', async ({
      flow,
    }) => {
      await configureModeration(flow);
      await aliceIsClaimed(flow);
      flow.discord.denySendingIn(MOD_CHANNEL);

      await aliceWithdraws(flow);

      expect({
        reply: replies(flow, ALICE.id).at(-1),
        participants: participants(flow),
        moderation: moderationChannel(flow),
      }).toEqual({
        reply: privately(ALICE.id, `You've withdrawn from **${FRU}**.`),
        participants: {},
        moderation: [],
      });
      flow.expectReported(/^warning: .*alice.*Missing Permissions/s);
    });
  });

  describe("when a member withdraws and the post can't be updated", () => {
    it('removes them and still confirms it', async ({ flow }) => {
      await aliceSignsUp(flow);
      flow.discord.failGuildFetches();

      await click(flow, 'withdraw', ALICE.id);

      expect({
        reply: replies(flow, ALICE.id).at(-1),
        participants: participants(flow),
      }).toEqual({
        reply: privately(ALICE.id, `You've withdrawn from **${FRU}**.`),
        participants: {},
      });
      flow.expectReported(/^Sentry exception: .*Internal Server Error/s);
      flow.expectReported(
        /^error: .*Failed to refresh event .* after a withdrawal/s,
      );
    });
  });

  describe('when a member signed up for several encounters withdraws', () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(`${participantsPath(flow)}/bob-FRU`, BOB_FRU);
      flow.db.seed(`${participantsPath(flow)}/bob-TOP`, BOB_TOP);
      await click(flow, 'withdraw', BOB.id);
    });

    it('asks which encounter', ({ flow }) => {
      expect(replies(flow, BOB.id)).toEqual([
        privateReply(BOB.id, {
          content: 'Which encounter are you withdrawing from?',
          components: [
            selectRow('eventWithdrawEncounter', 'Encounter', [
              { label: FRU, value: Encounter.FRU },
              { label: TOP, value: Encounter.TOP },
            ]),
          ],
        }),
      ]);
    });

    describe('and lets the prompt expire', () => {
      it('says so, removes the menu and records it', async ({ flow }) => {
        const metrics = await metricsDuring(async () => {
          flow.discord.expireAll();
          await flow.settle();
        });

        expect({
          replies: replies(flow, BOB.id),
          participants: participants(flow),
          metrics,
        }).toEqual({
          replies: [
            privately(
              BOB.id,
              'This withdrawal expired. Click Withdraw again if you still want to leave.',
            ),
          ],
          participants: { 'bob-FRU': BOB_FRU, 'bob-TOP': BOB_TOP },
          metrics: [expiredMetric('withdraw', BOB)],
        });
      });
    });

    describe('and picks one', () => {
      it.beforeEach(({ flow }) => choose(flow, BOB.id, Encounter.TOP));

      it('removes only that one and updates the post', ({ flow }) => {
        expect({
          replies: replies(flow, BOB.id),
          participants: participants(flow),
          post: posted(flow),
        }).toEqual({
          replies: [privately(BOB.id, `You've withdrawn from **${TOP}**.`)],
          participants: { 'bob-FRU': BOB_FRU },
          post: eventMessage(flow, [
            encounterField(FRU, 1),
            { name: 'fru-p3 (1)', value: BOB_LINE },
            encounterField(TOP, 0),
          ]),
        });
      });
    });
  });

  describe('when a member who is not signed up withdraws', () => {
    it('says so, privately', async ({ flow }) => {
      await click(flow, 'withdraw', CAROL.id);

      expect(replies(flow, CAROL.id)).toEqual([
        privately(CAROL.id, "You're not signed up for this event."),
      ]);
    });
  });
});

describe('when sign-ups close on schedule', () => {
  it.beforeEach(async ({ flow, cron }) => {
    await postEvent(flow);
    await aliceSignsUp(flow);
    vi.setSystemTime(AFTER_CLOSE);
    await runTick(cron.from);
    await flow.settle();
  });

  it('disables Sign up and keeps Withdraw', ({ flow }) => {
    expect(posted(flow)).toEqual(
      eventMessage(flow, ALICE_SIGNED_UP, {
        signups: 'Sign-ups closed',
        buttons: { signup: false, withdraw: true },
      }),
    );
  });

  it('still lets a member withdraw', async ({ flow }) => {
    await click(flow, 'withdraw', ALICE.id);

    expect({
      reply: replies(flow, ALICE.id).at(-1),
      participants: participants(flow),
    }).toEqual({
      reply: privately(ALICE.id, `You've withdrawn from **${FRU}**.`),
      participants: {},
    });
  });
});

describe('when an organizer closes the event', () => {
  it('disables both buttons', async ({ flow }) => {
    await postEvent(flow);
    flow.discord.command({
      userId: ORGANIZER.id,
      guildId: GUILD,
      channelId: EVENTS_CHANNEL,
      commandName: 'event',
      subcommand: 'close',
      options: { event: onlyEventId(flow) },
    });
    await flow.settle();

    expect(posted(flow)).toEqual(
      eventMessage(flow, NOBODY, {
        signups: 'Closed',
        buttons: { signup: false, withdraw: false },
      }),
    );
  });
});
