import { Encounter } from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect, vi } from 'vitest';
import type { EventDocument } from '../../firebase/models/event.model.js';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import { textReply } from '../../test-utils/replies.js';

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

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      try {
        const flow = await createFlowApp();
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
    },
    async (flow) => {
      try {
        await flow.close();
      } finally {
        vi.useRealTimers();
      }
    },
  ),
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

/** The organizer creates the DMU event starting at START, with `options` on top. */
const createEvent = (
  flow: FlowApp,
  options: Record<string, string> = {},
  userId: string = ORGANIZER.id,
) =>
  event(
    flow,
    'create',
    {
      title: TITLE,
      start: `<t:${START_S}:F>`,
      'encounter-1': Encounter.DMU,
      ...options,
    },
    userId,
  );

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

/** The event message as members see it, with `lines` between the start and the organizer. */
const eventMessage = (lines: string[] = []) => ({
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
      fields: [
        { name: '__Dancing Mad (Ultimate)__', value: 'No sign-ups yet' },
      ],
    },
  ],
  components: [],
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

const privately = (userId: string, content: string) =>
  textReply(userId, content, { ephemeral: true });

describe('/event create', () => {
  describe('when an organizer creates an event', () => {
    it.beforeEach(({ flow }) => createEvent(flow));

    it('posts the event in the channel, with nobody signed up', ({ flow }) => {
      expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
        eventMessage(),
      ]);
    });

    it('stores it open, with sign-ups closing at the start', ({ flow }) => {
      expect(flow.db.read(`events/${onlyEventId(flow)}`)).toEqual(
        storedEvent(flow),
      );
    });

    it('tells the organizer, privately, where it was posted', ({ flow }) => {
      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        privately(
          ORGANIZER.id,
          `Posted **${TITLE}** in <#${EVENTS_CHANNEL}>: https://discord.com/channels/${GUILD}/${EVENTS_CHANNEL}/${postedMessage(flow).id}`,
        ),
      ]);
    });
  });

  describe('when an organizer sets sign-ups to close before the start', () => {
    it.beforeEach(({ flow }) =>
      createEvent(flow, { 'signups-close': String(CLOSE_S) }),
    );

    it('shows when sign-ups close', ({ flow }) => {
      expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
        eventMessage([`Sign-ups close <t:${CLOSE_S}:R>`]),
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
  ])('when an organizer $when', ({ close, refusal }) => {
    it.beforeEach(({ flow }) => createEvent(flow, { 'signups-close': close }));

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
    it.beforeEach(({ flow }) => createEvent(flow, { start }));

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
    it.beforeEach(({ flow }) => createEvent(flow, {}, MEMBER.id));

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
      await createEvent(flow);
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

  describe('when an organizer picks the same encounter twice', () => {
    it.beforeEach(({ flow }) =>
      createEvent(flow, { 'encounter-2': Encounter.DMU }),
    );

    it('shows it once', ({ flow }) => {
      expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
        eventMessage(),
      ]);
    });

    it('stores it once', ({ flow }) => {
      expect(flow.db.read(`events/${onlyEventId(flow)}`)).toEqual(
        storedEvent(flow),
      );
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
        eventMessage(['Closed']),
      ]);
    });

    it('stores it closed, no longer due to close sign-ups', ({ flow }) => {
      const { signupsCloseDueAt: _due, ...closed } = storedEvent(flow, {
        status: 'closed',
      });
      expect(flow.db.read(`events/${onlyEventId(flow)}`)).toEqual(closed);
    });

    it('tells the organizer, privately', ({ flow }) => {
      expect(repliesTo(flow, ORGANIZER.id).at(-1)).toEqual(
        privately(ORGANIZER.id, `Closed **${TITLE}**.`),
      );
    });

    it('refuses to close it again', async ({ flow }) => {
      await event(flow, 'close', { event: onlyEventId(flow) });

      expect(repliesTo(flow, ORGANIZER.id).at(-1)).toEqual(
        privately(
          ORGANIZER.id,
          "That event is already closed or doesn't exist.",
        ),
      );
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
