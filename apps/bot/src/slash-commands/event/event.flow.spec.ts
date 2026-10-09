import type * as Sentry from '@sentry/nestjs';
import { Encounter } from '@ulti-project/shared';
import { ButtonStyle, ComponentType } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect, vi } from 'vitest';
import { appConfig } from '../../config/app.js';
import type { EventDocument } from '../../firebase/models/event.model.js';
import { EventSchedulerModule } from '../../jobs/event-scheduler/event-scheduler.module.js';
import {
  runTick,
  type SpiedCron,
  spiedCron,
} from '../../test-utils/cron-tick.js';
import { shown } from '../../test-utils/discord/fake-message.js';
import {
  type EventButtonsEnabled,
  encounterRow,
  eventButtonRow,
  recordChanges,
  ULTIMATE_CHOICES,
} from '../../test-utils/events.js';
import { fresh } from '../../test-utils/fixtures.js';
import {
  createFlowApp,
  type FlowApp,
  type FlowAppOptions,
} from '../../test-utils/flow-app.js';
import {
  commandErrorReply,
  expectCommandErrorReported,
  privateReply,
  textReply,
} from '../../test-utils/replies.js';
import { watchSentryMetrics } from '../../test-utils/sentry.js';

const GUILD = 'guild-1';
const OTHER_GUILD = 'guild-2';
const EVENTS_CHANNEL = 'events-channel';
const ORGANIZER_ROLE = 'organizer-role';
const ORGANIZER = Object.freeze({
  id: 'organizer-1',
  username: 'organizer',
  roles: [ORGANIZER_ROLE],
});
const MEMBER = Object.freeze({ id: 'member-1', username: 'member' });
const SETTINGS_PATH = `settings/${GUILD}`;

const TITLE = 'DMU prog night';
const NOW = new Date('2026-10-07T16:00:00Z');
/** A Monday, five days after NOW. */
const START = new Date('2026-10-12T16:00:00Z');
const CLOSE = new Date('2026-10-12T14:00:00Z');
const seconds = (date: Date) => date.getTime() / 1000;
const START_S = seconds(START);
const CLOSE_S = seconds(CLOSE);

const BAD_START =
  "I couldn't read that start time. Use a Discord timestamp like <t:1760000000:F> or unix seconds, in the future.";

/** Boots the app at NOW, with the events channel, an organizer and a member. */
async function startFlow(options?: FlowAppOptions): Promise<FlowApp> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    const flow = await createFlowApp(options);
    flow.discord.addChannel(GUILD, EVENTS_CHANNEL);
    flow.discord.addRole(GUILD, { id: ORGANIZER_ROLE, name: 'Organizer' });
    flow.discord.addMember(ORGANIZER);
    flow.discord.addMember(MEMBER);
    flow.db.seed(SETTINGS_PATH, { eventOrganizerRoles: [ORGANIZER_ROLE] });
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

/**
 * The app with the event-scheduler job. `cron.from` is spied before the app
 * boots, so it sees the job built and `runTick(cron.from)` runs its tick;
 * `start` does nothing, so cron never schedules a real tick that could fire
 * mid-test.
 */
const itWithScheduler = base.extend<{
  cron: SpiedCron;
  flow: FlowApp;
}>({
  cron: spiedCron(),
  flow: async ({ cron: _spiedBeforeBoot }, use) => {
    const flow = await startFlow({ modules: [EventSchedulerModule] });
    try {
      await use(flow);
    } finally {
      await stopFlow(flow);
    }
  },
});

/** `userId` runs `/event <subcommand>` in the events channel, and the bot finishes with it. */
async function event(
  flow: FlowApp,
  subcommand: string,
  options: Record<string, string>,
  userId: string = ORGANIZER.id,
) {
  flow.discord.command({
    userId,
    guildId: GUILD,
    channelId: EVENTS_CHANNEL,
    commandName: 'event',
    subcommand,
    options,
  });
  await flow.settle();
}

/** `userId` runs `/event create` for the event starting at START, with `options` on top. */
const openCreate = (
  flow: FlowApp,
  options: Record<string, string> = {},
  userId: string = ORGANIZER.id,
) =>
  event(
    flow,
    'create',
    { title: TITLE, start: `<t:${START_S}:F>`, ...options },
    userId,
  );

/** The organizer's latest reply: the panel of the command they ran last. */
function panel(flow: FlowApp) {
  const reply = flow.discord.repliesTo(ORGANIZER.id).at(-1);
  if (!reply) throw new Error('expected the organizer to have a reply');
  return reply;
}

async function chooseEncounters(flow: FlowApp, encounters: Encounter[]) {
  flow.discord.choose(panel(flow), encounters, ORGANIZER.id);
  await flow.settle();
}

async function click(flow: FlowApp, customId: 'eventPost' | 'eventCancel') {
  flow.discord.click(panel(flow), customId, ORGANIZER.id);
  await flow.settle();
}

/** The organizer creates the DMU event starting at START, with `options` on top. */
async function createEvent(
  flow: FlowApp,
  options: Record<string, string> = {},
) {
  await openCreate(flow, options);
  await chooseEncounters(flow, [Encounter.DMU]);
  await click(flow, 'eventPost');
}

/** The ids of the stored events. */
const eventIds = (flow: FlowApp) =>
  flow.db.documentsIn('events').map(({ id }) => id);

function onlyEventId(flow: FlowApp): string {
  const [id, ...others] = eventIds(flow);
  if (id === undefined || others.length > 0) {
    throw new Error(`expected one event, found ${eventIds(flow).length}`);
  }
  return id;
}

function postedMessage(flow: FlowApp) {
  const [message] = flow.discord.channel(EVENTS_CHANNEL);
  if (!message) throw new Error(`nothing was posted in ${EVENTS_CHANNEL}`);
  return message;
}

const OPEN_BUTTONS = Object.freeze({ signup: true, withdraw: true });
const SIGNUPS_CLOSED_BUTTONS = Object.freeze({ signup: false, withdraw: true });
const CLOSED_BUTTONS = Object.freeze({ signup: false, withdraw: false });

const NO_SIGNUPS = (encounter: string) => ({
  name: `__${encounter}__`,
  value: 'No sign-ups yet',
});

/** Event `eventId`'s message as members see it, with `lines` between the start and the organizer, `buttons` enabled, and `encounters` (their names) without sign-ups. */
const eventMessage = (
  eventId: string,
  lines: string[] = [],
  buttons: EventButtonsEnabled = OPEN_BUTTONS,
  encounters: string[] = ['Dancing Mad (Ultimate)'],
) => ({
  location: { kind: 'channel', guildId: GUILD, channelId: EVENTS_CHANNEL },
  content: undefined,
  embeds: [
    {
      title: TITLE,
      description: [
        `<t:${START_S}:F> (<t:${START_S}:R>)`,
        ...lines,
        `Organized by <@${ORGANIZER.id}>`,
      ].join('\n'),
      fields: encounters.map(NO_SIGNUPS),
    },
  ],
  components: [eventButtonRow(eventId, buttons)],
  reactions: {},
  deleted: false,
});

/** The stored event the organizer created, with `overrides`. */
const storedEvent = (
  flow: FlowApp,
  overrides: Partial<EventDocument> = {},
): EventDocument => ({
  guildId: GUILD,
  title: TITLE,
  startsAt: Timestamp.fromDate(START),
  signupsCloseAt: Timestamp.fromDate(START),
  signupsCloseDueAt: Timestamp.fromDate(START),
  encounters: [Encounter.DMU],
  channelId: EVENTS_CHANNEL,
  messageId: postedMessage(flow).id,
  createdBy: ORGANIZER.id,
  status: 'open',
  ...overrides,
});

const repliesTo = (flow: FlowApp, userId: string) =>
  flow.discord.repliesTo(userId).map(shown);

/** The create panel's line about the event starting at START. */
const SUMMARY = `**${TITLE}** · starts <t:${START_S}:F> · sign-ups close <t:${START_S}:R>`;

/** The create panel, privately, with `selected` picked and Post `postDisabled`. */
const createPanel = (selected: Encounter[], postDisabled: boolean) =>
  privateReply(ORGANIZER.id, {
    content: SUMMARY,
    components: [
      encounterRow(ULTIMATE_CHOICES, selected),
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            custom_id: 'eventPost',
            label: 'Post',
            style: ButtonStyle.Primary,
            disabled: postDisabled,
          },
          {
            type: ComponentType.Button,
            custom_id: 'eventCancel',
            label: 'Cancel',
            style: ButtonStyle.Secondary,
          },
        ],
      },
    ],
  });

const privately = (userId: string, content: string) =>
  textReply(userId, content, { ephemeral: true });

/** The organizer's private confirmation that the event was posted. */
const postedReply = (flow: FlowApp) =>
  privately(
    ORGANIZER.id,
    `Posted **${TITLE}** in <#${EVENTS_CHANNEL}>: https://discord.com/channels/${GUILD}/${EVENTS_CHANNEL}/${postedMessage(flow).id}`,
  );

describe('/event create', () => {
  describe('when an organizer creates an event', () => {
    it.beforeEach(({ flow }) => createEvent(flow));

    it('posts the event in the channel, with nobody signed up', ({ flow }) => {
      expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
        eventMessage(onlyEventId(flow)),
      ]);
    });

    it('stores it open, with sign-ups closing at the start', ({ flow }) => {
      expect(flow.db.read(`events/${onlyEventId(flow)}`)).toEqual(
        storedEvent(flow),
      );
    });

    it('tells the organizer, privately, where it was posted', ({ flow }) => {
      expect(repliesTo(flow, ORGANIZER.id)).toEqual([postedReply(flow)]);
    });
  });

  describe('when an organizer sets sign-ups to close before the start', () => {
    it.beforeEach(({ flow }) =>
      createEvent(flow, { 'signups-close': String(CLOSE_S) }),
    );

    it('shows when sign-ups close', ({ flow }) => {
      expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
        eventMessage(onlyEventId(flow), [`Sign-ups close <t:${CLOSE_S}:R>`]),
      ]);
    });

    it('stores that close time', ({ flow }) => {
      expect(flow.db.read(`events/${onlyEventId(flow)}`)).toEqual(
        storedEvent(flow, {
          signupsCloseAt: Timestamp.fromDate(CLOSE),
          signupsCloseDueAt: Timestamp.fromDate(CLOSE),
        }),
      );
    });
  });

  describe.each([
    {
      when: 'sets sign-ups to close after the start',
      close: String(START_S + 60),
      refusal: 'Sign-ups must close at or before the start time.',
    },
    {
      when: 'sets sign-ups to close in the past',
      close: String(seconds(NOW) - 60),
      refusal:
        "I couldn't read that sign-up close time. Use a Discord timestamp like <t:1760000000:F> or unix seconds, in the future.",
    },
    {
      when: 'gives a sign-up close of "tomorrow"',
      close: 'tomorrow',
      refusal:
        "I couldn't read that sign-up close time. Use a Discord timestamp like <t:1760000000:F> or unix seconds, in the future.",
    },
  ])('when an organizer $when', ({ close, refusal }) => {
    it.beforeEach(({ flow }) => openCreate(flow, { 'signups-close': close }));

    it('refuses, privately, and posts nothing', ({ flow }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        posted: flow.discord.channel(EVENTS_CHANNEL),
        events: eventIds(flow),
      }).toEqual({
        replies: [privately(ORGANIZER.id, refusal)],
        posted: [],
        events: [],
      });
    });
  });

  describe.each([
    { when: 'a start in the past', start: `<t:${seconds(NOW) - 60}:F>` },
    { when: 'a start of "tomorrow"', start: 'tomorrow' },
    { when: 'a start in milliseconds', start: String(START.getTime()) },
  ])('when an organizer gives $when', ({ start }) => {
    it.beforeEach(({ flow }) => openCreate(flow, { start }));

    it('refuses, privately, and posts nothing', ({ flow }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        posted: flow.discord.channel(EVENTS_CHANNEL),
        events: eventIds(flow),
      }).toEqual({
        replies: [privately(ORGANIZER.id, BAD_START)],
        posted: [],
        events: [],
      });
    });
  });

  describe('when a member who is not an organizer tries', () => {
    it.beforeEach(({ flow }) => openCreate(flow, {}, MEMBER.id));

    it('refuses, privately, and posts nothing', ({ flow }) => {
      expect({
        replies: repliesTo(flow, MEMBER.id),
        posted: flow.discord.channel(EVENTS_CHANNEL),
        events: eventIds(flow),
      }).toEqual({
        replies: [privately(MEMBER.id, 'Only event organizers can do that.')],
        posted: [],
        events: [],
      });
    });
  });

  describe('when no organizer roles are set', () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(SETTINGS_PATH, {});
      await openCreate(flow);
    });

    it('tells them an admin has to set them, and posts nothing', ({ flow }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        posted: flow.discord.channel(EVENTS_CHANNEL),
        events: eventIds(flow),
      }).toEqual({
        replies: [
          privately(
            ORGANIZER.id,
            'No event organizer roles are set. An admin can set them with /settings event-organizers.',
          ),
        ],
        posted: [],
        events: [],
      });
    });
  });

  describe('when the bot may not send messages in the channel', () => {
    it.beforeEach(async ({ flow }) => {
      flow.discord.denySendingIn(EVENTS_CHANNEL);
      await createEvent(flow);
      expectCommandErrorReported(flow, 'Missing Permissions');
    });

    it('shows the organizer the command error, and keeps no event', ({
      flow,
    }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        posted: flow.discord.channel(EVENTS_CHANNEL),
        events: eventIds(flow),
      }).toEqual({
        replies: [
          { ...commandErrorReply(flow, ORGANIZER.id), content: SUMMARY },
        ],
        posted: [],
        events: [],
      });
    });
  });

  describe('when an organizer opens the panel', () => {
    it.beforeEach(({ flow }) => openCreate(flow));

    it('shows the event and the encounters, privately, with Post disabled', ({
      flow,
    }) => {
      expect(repliesTo(flow, ORGANIZER.id)).toEqual([createPanel([], true)]);
    });

    describe('and picks an encounter', () => {
      it.beforeEach(({ flow }) => chooseEncounters(flow, [Encounter.DMU]));

      it('shows it picked and enables Post', ({ flow }) => {
        expect(repliesTo(flow, ORGANIZER.id)).toEqual([
          createPanel([Encounter.DMU], false),
        ]);
      });
    });

    describe('and cancels', () => {
      it.beforeEach(({ flow }) => click(flow, 'eventCancel'));

      it('says so, and posts and stores nothing', ({ flow }) => {
        expect({
          replies: repliesTo(flow, ORGANIZER.id),
          posted: flow.discord.channel(EVENTS_CHANNEL),
          events: eventIds(flow),
        }).toEqual({
          replies: [privately(ORGANIZER.id, 'Cancelled.')],
          posted: [],
          events: [],
        });
      });
    });

    describe('and lets the panel expire', () => {
      it('says so, stores nothing, and counts the expired prompt', async ({
        flow,
      }) => {
        const metrics: Sentry.Metric[] = [];
        const stop = watchSentryMetrics((metric) => metrics.push(metric));
        try {
          flow.discord.expireAll();
          await flow.settle();
        } finally {
          stop();
        }

        expect({
          replies: repliesTo(flow, ORGANIZER.id),
          posted: flow.discord.channel(EVENTS_CHANNEL),
          events: eventIds(flow),
          metrics,
        }).toEqual({
          replies: [privately(ORGANIZER.id, 'This prompt expired.')],
          posted: [],
          events: [],
          metrics: [
            {
              name: 'discord.prompt.expired',
              type: 'counter',
              value: 1,
              attributes: {
                command: 'event',
                subcommand: 'create',
                'user.id': ORGANIZER.id,
                'user.name': ORGANIZER.username,
              },
            },
          ],
        });
      });
    });

    describe('and clicks Post', () => {
      it('takes the buttons away at once, then posts and stores one event', async ({
        flow,
      }) => {
        await chooseEncounters(flow, [Encounter.DMU]);
        flow.discord.click(panel(flow), 'eventPost', ORGANIZER.id);
        // nothing is left to click a second time while it posts
        const whilePosting = shown(panel(flow));
        await flow.settle();

        expect({
          whilePosting,
          posted: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          event: flow.db.read(`events/${onlyEventId(flow)}`),
          replies: repliesTo(flow, ORGANIZER.id),
        }).toEqual({
          whilePosting: privateReply(ORGANIZER.id, { content: SUMMARY }),
          posted: [eventMessage(onlyEventId(flow))],
          event: storedEvent(flow),
          replies: [postedReply(flow)],
        });
      });
    });
  });

  describe('when the bot runs legacy encounters too', () => {
    it.beforeEach(() => {
      const modes = appConfig.APPLICATION_MODE;
      appConfig.APPLICATION_MODE = ['legacy', 'ultimate'];
      return () => {
        appConfig.APPLICATION_MODE = modes;
      };
    });

    describe('and an organizer picks FRU, then TOP, and posts', () => {
      it.beforeEach(async ({ flow }) => {
        await openCreate(flow);
        await chooseEncounters(flow, [Encounter.FRU, Encounter.TOP]);
        await click(flow, 'eventPost');
      });

      it('posts and stores them in the encounter order, and says where', ({
        flow,
      }) => {
        expect({
          posted: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          event: flow.db.read(`events/${onlyEventId(flow)}`),
          replies: repliesTo(flow, ORGANIZER.id),
        }).toEqual({
          posted: [
            eventMessage(onlyEventId(flow), [], OPEN_BUTTONS, [
              '[TOP] The Omega Protocol',
              '[FRU] Futures Rewritten',
            ]),
          ],
          event: storedEvent(flow, {
            encounters: [Encounter.TOP, Encounter.FRU],
          }),
          replies: [postedReply(flow)],
        });
      });
    });
  });
});

describe('/event close', () => {
  describe('when an organizer looks for an event to close', () => {
    it('offers the guild events that are not closed, soonest first', async ({
      flow,
    }) => {
      const seedEvent = (
        id: string,
        overrides: Partial<Record<keyof EventDocument, unknown>>,
      ) =>
        flow.db.seed(`events/${id}`, {
          guildId: GUILD,
          title: TITLE,
          startsAt: START,
          signupsCloseAt: START,
          encounters: [Encounter.DMU],
          channelId: EVENTS_CHANNEL,
          createdBy: ORGANIZER.id,
          status: 'open',
          ...overrides,
        });
      seedEvent('later', {
        title: 'Reclear',
        startsAt: new Date('2026-10-14T01:00:00Z'),
        signupsCloseAt: new Date('2026-10-14T01:00:00Z'),
        status: 'signups-closed',
      });
      seedEvent('sooner', {});
      seedEvent('closed', { title: 'Old night', status: 'closed' });
      seedEvent('elsewhere', { guildId: OTHER_GUILD });

      const choices = await flow.discord.autocomplete({
        userId: ORGANIZER.id,
        guildId: GUILD,
        commandName: 'event',
        subcommand: 'close',
        focused: 'event',
        value: '',
      });

      expect(choices).toEqual([
        { name: `${TITLE} · Mon, Oct 12`, value: 'sooner' },
        // 01:00 UTC on the 14th is still the 13th in US Eastern
        { name: 'Reclear · Tue, Oct 13', value: 'later' },
      ]);
    });
  });

  describe('when an organizer closes an open event', () => {
    it.beforeEach(async ({ flow }) => {
      await createEvent(flow);
      await event(flow, 'close', { event: onlyEventId(flow) });
    });

    it('shows the event as closed', ({ flow }) => {
      expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
        eventMessage(onlyEventId(flow), ['Closed'], CLOSED_BUTTONS),
      ]);
    });

    it('stores it closed, no longer due to close sign-ups', ({ flow }) => {
      const { signupsCloseDueAt: _due, ...closed } = storedEvent(flow, {
        status: 'closed',
      });
      expect(flow.db.read(`events/${onlyEventId(flow)}`)).toEqual(closed);
    });

    it('tells the organizer, privately', ({ flow }) => {
      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        postedReply(flow),
        privately(ORGANIZER.id, `Closed **${TITLE}**.`),
      ]);
    });

    it('refuses to close it again', async ({ flow }) => {
      await event(flow, 'close', { event: onlyEventId(flow) });

      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        postedReply(flow),
        privately(ORGANIZER.id, `Closed **${TITLE}**.`),
        privately(
          ORGANIZER.id,
          "That event is already closed or doesn't exist.",
        ),
      ]);
    });
  });

  describe('when an organizer closes an event a board has open', () => {
    it('tells the board the event changed, and not again for a second close', async ({
      flow,
    }) => {
      await createEvent(flow);
      const id = onlyEventId(flow);
      const changes = recordChanges(flow, id);

      await event(flow, 'close', { event: id });
      await event(flow, 'close', { event: id });

      expect(changes).toEqual([{ kind: 'event', eventId: id }]);
    });
  });

  describe('when an organizer closes an event that does not exist', () => {
    it('says so, privately', async ({ flow }) => {
      await event(flow, 'close', { event: 'missing' });

      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        privately(
          ORGANIZER.id,
          "That event is already closed or doesn't exist.",
        ),
      ]);
    });
  });

  describe("when an organizer closes an event whose message can't be updated", () => {
    it.beforeEach(async ({ flow }) => {
      await createEvent(flow);
      flow.discord.failGuildFetches();
      await event(flow, 'close', { event: onlyEventId(flow) });
    });

    it('stores it closed and still tells the organizer', ({ flow }) => {
      const { signupsCloseDueAt: _due, ...closed } = storedEvent(flow, {
        status: 'closed',
      });
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        stored: flow.db.read(`events/${onlyEventId(flow)}`),
      }).toEqual({
        replies: [
          postedReply(flow),
          privately(ORGANIZER.id, `Closed **${TITLE}**.`),
        ],
        stored: closed,
      });
      flow.expectReported(/^Sentry exception: .*Internal Server Error/s);
      flow.expectReported(/^error: .*Failed to refresh closed event/s);
    });
  });

  describe("when an organizer closes another guild's event", () => {
    const ELSEWHERE_PATH = 'events/elsewhere';
    const elsewhere = Object.freeze({
      guildId: OTHER_GUILD,
      title: TITLE,
      startsAt: Timestamp.fromDate(START),
      signupsCloseAt: Timestamp.fromDate(START),
      signupsCloseDueAt: Timestamp.fromDate(START),
      encounters: [Encounter.DMU],
      channelId: 'elsewhere-channel',
      messageId: 'elsewhere-message',
      createdBy: 'someone-else',
      status: 'open',
    });

    it.beforeEach(async ({ flow }) => {
      flow.db.seed(ELSEWHERE_PATH, elsewhere);
      await event(flow, 'close', { event: 'elsewhere' });
    });

    it("says it doesn't exist and leaves it open", ({ flow }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        stored: flow.db.read(ELSEWHERE_PATH),
      }).toEqual({
        replies: [
          privately(
            ORGANIZER.id,
            "That event is already closed or doesn't exist.",
          ),
        ],
        stored: elsewhere,
      });
    });
  });

  describe('when an organizer gives an event id with a slash', () => {
    it('says it does not exist, privately', async ({ flow }) => {
      await event(flow, 'close', { event: 'a/b' });

      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        privately(
          ORGANIZER.id,
          "That event is already closed or doesn't exist.",
        ),
      ]);
    });
  });

  describe('when a member who is not an organizer tries to close an event', () => {
    it.beforeEach(async ({ flow }) => {
      await createEvent(flow);
      await event(flow, 'close', { event: onlyEventId(flow) }, MEMBER.id);
    });

    it('refuses, privately, and leaves the event open', ({ flow }) => {
      expect({
        replies: repliesTo(flow, MEMBER.id),
        stored: flow.db.read(`events/${onlyEventId(flow)}`),
      }).toEqual({
        replies: [privately(MEMBER.id, 'Only event organizers can do that.')],
        stored: storedEvent(flow),
      });
    });
  });
});

describe('the event-scheduler job', () => {
  /** A moment after sign-ups close at CLOSE. */
  const AFTER_CLOSE = new Date(CLOSE.getTime() + 30_000);

  describe('when an event passes its sign-up close time', () => {
    itWithScheduler.beforeEach(async ({ flow, cron }) => {
      await createEvent(flow, { 'signups-close': String(CLOSE_S) });
      vi.setSystemTime(AFTER_CLOSE);
      await runTick(cron.from);
    });

    itWithScheduler('shows that sign-ups are closed', ({ flow }) => {
      expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
        eventMessage(
          onlyEventId(flow),
          ['Sign-ups closed'],
          SIGNUPS_CLOSED_BUTTONS,
        ),
      ]);
    });

    itWithScheduler(
      'stores sign-ups closed, no longer due to close',
      ({ flow }) => {
        const { signupsCloseDueAt: _due, ...closed } = storedEvent(flow, {
          signupsCloseAt: Timestamp.fromDate(CLOSE),
          status: 'signups-closed',
        });
        expect(flow.db.read(`events/${onlyEventId(flow)}`)).toEqual(closed);
      },
    );
  });

  describe('when an event has not reached its sign-up close time', () => {
    itWithScheduler('leaves it open', async ({ flow, cron }) => {
      await createEvent(flow, { 'signups-close': String(CLOSE_S) });
      vi.setSystemTime(new Date(CLOSE.getTime() - 1000));

      await runTick(cron.from);

      expect({
        shown: flow.discord.channel(EVENTS_CHANNEL).map(shown),
        stored: flow.db.read(`events/${onlyEventId(flow)}`),
      }).toEqual({
        shown: [
          eventMessage(onlyEventId(flow), [`Sign-ups close <t:${CLOSE_S}:R>`]),
        ],
        stored: storedEvent(flow, {
          signupsCloseAt: Timestamp.fromDate(CLOSE),
          signupsCloseDueAt: Timestamp.fromDate(CLOSE),
        }),
      });
    });
  });

  describe('when a closed event passes its sign-up close time', () => {
    itWithScheduler('leaves it closed', async ({ flow, cron }) => {
      await createEvent(flow, { 'signups-close': String(CLOSE_S) });
      await event(flow, 'close', { event: onlyEventId(flow) });
      vi.setSystemTime(AFTER_CLOSE);

      await runTick(cron.from);

      const { signupsCloseDueAt: _due, ...closed } = storedEvent(flow, {
        signupsCloseAt: Timestamp.fromDate(CLOSE),
        status: 'closed',
      });
      expect({
        shown: flow.discord.channel(EVENTS_CHANNEL).map(shown),
        stored: flow.db.read(`events/${onlyEventId(flow)}`),
      }).toEqual({
        shown: [eventMessage(onlyEventId(flow), ['Closed'], CLOSED_BUTTONS)],
        stored: closed,
      });
    });
  });

  describe('when an earlier due event cannot be re-rendered', () => {
    /** An event in a server the bot has since left, due before the other. */
    const GONE_PATH = 'events/gone';
    const goneEvent = Object.freeze({
      guildId: 'left-guild',
      title: 'Old server night',
      startsAt: Timestamp.fromDate(START),
      signupsCloseAt: Timestamp.fromDate(NOW),
      signupsCloseDueAt: Timestamp.fromDate(NOW),
      encounters: [Encounter.DMU],
      channelId: 'left-channel',
      messageId: 'left-message',
      createdBy: ORGANIZER.id,
      status: 'open',
    });

    itWithScheduler.beforeEach(async ({ flow, cron }) => {
      await createEvent(flow, { 'signups-close': String(CLOSE_S) });
      flow.db.seed(GONE_PATH, goneEvent);
      vi.setSystemTime(AFTER_CLOSE);
      await runTick(cron.from);
      await flow.settle();
      flow.expectReported(/^Sentry exception: .*Unknown Guild/s);
      flow.expectReported(/^error: .*Failed to close sign-ups for event gone/s);
    });

    itWithScheduler('still closes sign-ups for the other', ({ flow }) => {
      const ownId = eventIds(flow).find((id) => id !== 'gone');
      if (ownId === undefined) throw new Error("the organizer's event is gone");
      const { signupsCloseDueAt: _due, ...closed } = storedEvent(flow, {
        signupsCloseAt: Timestamp.fromDate(CLOSE),
        status: 'signups-closed',
      });
      expect({
        shown: flow.discord.channel(EVENTS_CHANNEL).map(shown),
        stored: flow.db.read(`events/${ownId}`),
      }).toEqual({
        shown: [
          eventMessage(ownId, ['Sign-ups closed'], SIGNUPS_CLOSED_BUTTONS),
        ],
        stored: closed,
      });
    });

    itWithScheduler(
      'closes sign-ups for the one it cannot show',
      ({ flow }) => {
        const { signupsCloseDueAt: _due, ...gone } = goneEvent;
        expect(flow.db.read(GONE_PATH)).toEqual({
          ...gone,
          status: 'signups-closed',
        });
      },
    );
  });

  describe('when open events pass their sign-up close time', () => {
    itWithScheduler(
      'tells each board its event changed once, even when the event cannot be shown',
      async ({ flow, cron }) => {
        await createEvent(flow, { 'signups-close': String(CLOSE_S) });
        const id = onlyEventId(flow);
        flow.db.seed('events/gone', {
          guildId: 'left-guild',
          title: 'Old server night',
          startsAt: Timestamp.fromDate(START),
          signupsCloseAt: Timestamp.fromDate(NOW),
          signupsCloseDueAt: Timestamp.fromDate(NOW),
          encounters: [Encounter.DMU],
          channelId: 'left-channel',
          messageId: 'left-message',
          createdBy: ORGANIZER.id,
          status: 'open',
        });
        const changes = {
          own: recordChanges(flow, id),
          gone: recordChanges(flow, 'gone'),
        };
        vi.setSystemTime(AFTER_CLOSE);

        await runTick(cron.from);
        await runTick(cron.from);
        await flow.settle();

        flow.expectReported(/^Sentry exception: .*Unknown Guild/s);
        flow.expectReported(
          /^error: .*Failed to close sign-ups for event gone/s,
        );
        expect(changes).toEqual({
          own: [{ kind: 'event', eventId: id }],
          gone: [{ kind: 'event', eventId: 'gone' }],
        });
      },
    );
  });
});
