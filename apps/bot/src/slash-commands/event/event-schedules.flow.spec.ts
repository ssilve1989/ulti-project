import type * as Sentry from '@sentry/nestjs';
import { Encounter } from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect, vi } from 'vitest';
import { USTimeZones } from '../../common/time-zones.js';
import type { Weekday } from '../../events/schedules/next-occurrence.js';
import type { EventDocument } from '../../firebase/models/event.model.js';
import type { EventScheduleDocument } from '../../firebase/models/event-schedule.model.js';
import { EventSchedulerModule } from '../../jobs/event-scheduler/event-scheduler.module.js';
import {
  runTick,
  type SpiedCron,
  spiedCron,
} from '../../test-utils/cron-tick.js';
import { shown } from '../../test-utils/discord/fake-message.js';
import { eventButtonRow } from '../../test-utils/events.js';
import { fresh } from '../../test-utils/fixtures.js';
import {
  createFlowApp,
  type FlowApp,
  type FlowAppOptions,
} from '../../test-utils/flow-app.js';
import { privateReply, textReply } from '../../test-utils/replies.js';
import {
  buttonRow,
  daysRow,
  SUMMER_LABELS,
  zoneRow,
} from '../../test-utils/schedule-panel.js';
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

const TITLE = 'DMU prog night';
/** Wednesday 2026-10-07, noon Eastern (EDT). */
const NOW = new Date('2026-10-07T16:00:00Z');
const seconds = (iso: string) => Date.parse(iso) / 1000;

const BAD_TIME = "I couldn't read that time. Try 20:00, 8pm or 8:30 pm.";
const BAD_HOURS =
  'Sign-ups must close less than post-ahead hours before the start.';
const EXPIRED = 'This schedule panel expired. Nothing was saved.';

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
    flow.db.seed(`settings/${GUILD}`, {
      eventOrganizerRoles: [ORGANIZER_ROLE],
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

/**
 * The app with the event-scheduler job: `runTick(cron.from)` runs its tick,
 * and no real tick fires mid-test.
 */
const itWithScheduler = base.extend<{ cron: SpiedCron; flow: FlowApp }>({
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
  options: Record<string, string | number>,
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

/** The organizer runs `/event schedule-create` for DMU at 8pm, with `options` on top. */
const createSchedule = (
  flow: FlowApp,
  options: Record<string, string | number> = {},
  userId: string = ORGANIZER.id,
) =>
  event(
    flow,
    'schedule-create',
    { title: TITLE, 'encounter-1': Encounter.DMU, time: '8pm', ...options },
    userId,
  );

function panel(flow: FlowApp) {
  const [reply, ...others] = flow.discord.repliesTo(ORGANIZER.id);
  if (!reply || others.length > 0) {
    throw new Error('expected the organizer to have one reply');
  }
  return reply;
}

async function chooseDays(flow: FlowApp, days: readonly Weekday[]) {
  flow.discord.choose(panel(flow), days, ORGANIZER.id, 'scheduleDays');
  await flow.settle();
}

async function chooseZone(flow: FlowApp, zone: string) {
  flow.discord.choose(panel(flow), zone, ORGANIZER.id, 'scheduleZone');
  await flow.settle();
}

async function click(
  flow: FlowApp,
  customId: 'scheduleSave' | 'scheduleCancel',
) {
  flow.discord.click(panel(flow), customId, ORGANIZER.id);
  await flow.settle();
}

const repliesTo = (flow: FlowApp, userId: string) =>
  flow.discord.repliesTo(userId).map(shown);

const privately = (userId: string, content: string) =>
  textReply(userId, content, { ephemeral: true });

const schedules = (flow: FlowApp) => flow.db.documentsIn('event-schedules');

function onlyScheduleId(flow: FlowApp): string {
  const [schedule, ...others] = schedules(flow);
  if (schedule === undefined || others.length > 0) {
    throw new Error(`expected one schedule, found ${schedules(flow).length}`);
  }
  return schedule.id;
}

/** The panel's fields for a DMU schedule in the events channel posted `postAhead` ahead. */
const panelFields = (postAhead: string) => [
  { name: 'Encounters', value: 'Dancing Mad (Ultimate)' },
  { name: 'Channel', value: `<#${EVENTS_CHANNEL}>` },
  { name: 'Post ahead', value: postAhead },
];

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

/** Thursday 2026-10-08 at 8 PM Eastern, and 72 hours before it. */
const EASTERN_START_S = seconds('2026-10-09T00:00:00Z');
const EASTERN_POST_S = seconds('2026-10-06T00:00:00Z');
/** Thursday 2026-10-08 at 8 PM Pacific, and 72 hours before it. */
const PACIFIC_START_S = seconds('2026-10-09T03:00:00Z');
const PACIFIC_POST_S = seconds('2026-10-06T03:00:00Z');

describe('/event schedule-create', () => {
  describe('when an organizer starts a schedule', () => {
    it.beforeEach(({ flow }) => createSchedule(flow));

    it('shows the panel, privately, asking for a day with Save disabled', ({
      flow,
    }) => {
      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        privateReply(ORGANIZER.id, {
          embeds: [
            {
              title: `New schedule: ${TITLE}`,
              description: 'Pick at least one day.',
              fields: panelFields('72 hours'),
            },
          ],
          components: [
            daysRow([]),
            zoneRow(SUMMER_LABELS, USTimeZones.EASTERN),
            buttonRow(true),
          ],
        }),
      ]);
    });

    describe('and picks Tuesday and Thursday', () => {
      it.beforeEach(({ flow }) => chooseDays(flow, ['tue', 'thu']));

      it('previews the next event in Eastern time and enables Save', ({
        flow,
      }) => {
        expect(repliesTo(flow, ORGANIZER.id)).toEqual([
          privateReply(ORGANIZER.id, {
            embeds: [
              {
                title: `New schedule: ${TITLE}`,
                description: [
                  'Tue, Thu at 8:00 PM Eastern.',
                  `The next event starts <t:${EASTERN_START_S}:F> and is posted <t:${EASTERN_POST_S}:R>.`,
                  'Sign-ups close when it starts.',
                ].join('\n'),
                fields: panelFields('72 hours'),
              },
            ],
            components: [
              daysRow(['tue', 'thu']),
              zoneRow(SUMMER_LABELS, USTimeZones.EASTERN),
              buttonRow(false),
            ],
          }),
        ]);
      });

      describe('and picks Pacific', () => {
        it.beforeEach(({ flow }) => chooseZone(flow, USTimeZones.PACIFIC));

        it('previews the next event in Pacific time', ({ flow }) => {
          expect(repliesTo(flow, ORGANIZER.id)).toEqual([
            privateReply(ORGANIZER.id, {
              embeds: [
                {
                  title: `New schedule: ${TITLE}`,
                  description: [
                    'Tue, Thu at 8:00 PM Pacific.',
                    `The next event starts <t:${PACIFIC_START_S}:F> and is posted <t:${PACIFIC_POST_S}:R>.`,
                    'Sign-ups close when it starts.',
                  ].join('\n'),
                  fields: panelFields('72 hours'),
                },
              ],
              components: [
                daysRow(['tue', 'thu']),
                zoneRow(SUMMER_LABELS, USTimeZones.PACIFIC),
                buttonRow(false),
              ],
            }),
          ]);
        });

        describe('and saves', () => {
          it.beforeEach(({ flow }) => click(flow, 'scheduleSave'));

          it('stores the schedule with its next start and post times', ({
            flow,
          }) => {
            expect(
              flow.db.read(`event-schedules/${onlyScheduleId(flow)}`),
            ).toEqual({
              guildId: GUILD,
              title: TITLE,
              encounters: [Encounter.DMU],
              channelId: EVENTS_CHANNEL,
              weekdays: ['tue', 'thu'],
              startTime: '20:00',
              timeZone: USTimeZones.PACIFIC,
              postLeadHours: 72,
              signupsCloseBeforeHours: 0,
              paused: false,
              nextStartAt: Timestamp.fromMillis(PACIFIC_START_S * 1000),
              nextPostAt: Timestamp.fromMillis(PACIFIC_POST_S * 1000),
              createdBy: ORGANIZER.id,
              updatedBy: ORGANIZER.id,
            } satisfies EventScheduleDocument);
          });

          it('replaces the panel with a summary', ({ flow }) => {
            expect(repliesTo(flow, ORGANIZER.id)).toEqual([
              privately(
                ORGANIZER.id,
                `Saved **${TITLE}**: Tue, Thu at 8:00 PM Pacific in <#${EVENTS_CHANNEL}>. Next event <t:${PACIFIC_START_S}:F>, posted <t:${PACIFIC_POST_S}:R>.`,
              ),
            ]);
          });
        });
      });

      describe('and cancels', () => {
        it.beforeEach(({ flow }) => click(flow, 'scheduleCancel'));

        it('stores nothing and says so', ({ flow }) => {
          expect({
            replies: repliesTo(flow, ORGANIZER.id),
            schedules: schedules(flow),
          }).toEqual({
            replies: [privately(ORGANIZER.id, 'Nothing saved.')],
            schedules: [],
          });
        });
      });

      describe('and lets the panel expire', () => {
        it('stores nothing, says so, and counts the expired prompt', async ({
          flow,
        }) => {
          const metrics = await metricsDuring(async () => {
            flow.discord.expireAll();
            await flow.settle();
          });

          expect({
            replies: repliesTo(flow, ORGANIZER.id),
            schedules: schedules(flow),
            metrics,
          }).toEqual({
            replies: [privately(ORGANIZER.id, EXPIRED)],
            schedules: [],
            metrics: [
              {
                name: 'discord.prompt.expired',
                type: 'counter',
                value: 1,
                attributes: {
                  command: 'event',
                  subcommand: 'schedule-create',
                  'user.id': ORGANIZER.id,
                  'user.name': ORGANIZER.username,
                },
              },
            ],
          });
        });
      });
    });
  });

  describe.each([
    ['a time it cannot read', { time: '8' }, BAD_TIME],
    [
      'sign-ups closing as early as it posts',
      { 'post-ahead': 24, 'signups-close-before': 24 },
      BAD_HOURS,
    ],
  ])('when an organizer gives %s', (_case, options, message) => {
    it.beforeEach(({ flow }) => createSchedule(flow, options));

    it('refuses, privately, and stores nothing', ({ flow }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        schedules: schedules(flow),
      }).toEqual({
        replies: [privately(ORGANIZER.id, message)],
        schedules: [],
      });
    });
  });

  describe('when a member who is not an organizer tries', () => {
    it.beforeEach(({ flow }) => createSchedule(flow, {}, MEMBER.id));

    it('refuses, privately, and stores nothing', ({ flow }) => {
      expect({
        replies: repliesTo(flow, MEMBER.id),
        schedules: schedules(flow),
      }).toEqual({
        replies: [privately(MEMBER.id, 'Only event organizers can do that.')],
        schedules: [],
      });
    });
  });
});

const SCHEDULE_ID = 'schedule-1';
const SCHEDULE_PATH = `event-schedules/${SCHEDULE_ID}`;
const FORMER_ORGANIZER = 'organizer-0';

/** A Tue/Thu 8 PM Pacific schedule, posted a day ahead, whose times are from last week. */
const STORED_SCHEDULE: EventScheduleDocument = Object.freeze({
  guildId: GUILD,
  title: TITLE,
  encounters: [Encounter.DMU],
  channelId: EVENTS_CHANNEL,
  weekdays: ['tue', 'thu'] satisfies Weekday[],
  startTime: '20:00',
  timeZone: USTimeZones.PACIFIC,
  postLeadHours: 24,
  signupsCloseBeforeHours: 2,
  paused: false,
  nextStartAt: Timestamp.fromDate(new Date('2026-10-02T03:00:00Z')),
  nextPostAt: Timestamp.fromDate(new Date('2026-10-01T03:00:00Z')),
  createdBy: FORMER_ORGANIZER,
  updatedBy: FORMER_ORGANIZER,
});

/** Thursday 2026-10-08 at 9 PM Pacific, a day before it, and 2 hours before it. */
const NINE_PM_START_S = seconds('2026-10-09T04:00:00Z');
const NINE_PM_POST_S = seconds('2026-10-08T04:00:00Z');
const NINE_PM_CLOSE_S = seconds('2026-10-09T02:00:00Z');

describe('/event schedule-edit', () => {
  describe('when an organizer looks for a schedule to edit', () => {
    it("offers this guild's schedules with their days and time", async ({
      flow,
    }) => {
      flow.db.seed(SCHEDULE_PATH, STORED_SCHEDULE);
      flow.db.seed('event-schedules/schedule-2', {
        ...STORED_SCHEDULE,
        title: 'Reclear',
        weekdays: ['sun', 'mon'],
        startTime: '09:30',
      });
      flow.db.seed('event-schedules/elsewhere', {
        ...STORED_SCHEDULE,
        guildId: OTHER_GUILD,
      });

      const choices = await flow.discord.autocomplete({
        userId: ORGANIZER.id,
        guildId: GUILD,
        commandName: 'event',
        subcommand: 'schedule-edit',
        focused: 'schedule',
        value: '',
      });

      expect(choices).toEqual([
        { name: `${TITLE} · Tue, Thu 20:00`, value: SCHEDULE_ID },
        { name: 'Reclear · Mon, Sun 09:30', value: 'schedule-2' },
      ]);
    });
  });

  describe('when an organizer changes the time to 9pm', () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(SCHEDULE_PATH, STORED_SCHEDULE);
      await event(flow, 'schedule-edit', {
        schedule: SCHEDULE_ID,
        time: '9pm',
      });
    });

    it("opens the panel with the schedule's days and zone picked", ({
      flow,
    }) => {
      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        privateReply(ORGANIZER.id, {
          embeds: [
            {
              title: `Edit schedule: ${TITLE}`,
              description: [
                'Tue, Thu at 9:00 PM Pacific.',
                `The next event starts <t:${NINE_PM_START_S}:F> and is posted <t:${NINE_PM_POST_S}:R>.`,
                `Sign-ups close 2 hours before it starts (<t:${NINE_PM_CLOSE_S}:R>).`,
              ].join('\n'),
              fields: panelFields('24 hours'),
            },
          ],
          components: [
            daysRow(['tue', 'thu']),
            zoneRow(SUMMER_LABELS, USTimeZones.PACIFIC),
            buttonRow(false),
          ],
        }),
      ]);
    });

    describe('and saves', () => {
      it.beforeEach(({ flow }) => click(flow, 'scheduleSave'));

      it('stores the new time and next times, and keeps everything else', ({
        flow,
      }) => {
        expect(flow.db.read(SCHEDULE_PATH)).toEqual({
          ...STORED_SCHEDULE,
          startTime: '21:00',
          nextStartAt: Timestamp.fromMillis(NINE_PM_START_S * 1000),
          nextPostAt: Timestamp.fromMillis(NINE_PM_POST_S * 1000),
          updatedBy: ORGANIZER.id,
        });
      });

      it('replaces the panel with a summary', ({ flow }) => {
        expect(repliesTo(flow, ORGANIZER.id)).toEqual([
          privately(
            ORGANIZER.id,
            `Saved **${TITLE}**: Tue, Thu at 9:00 PM Pacific in <#${EVENTS_CHANNEL}>. Next event <t:${NINE_PM_START_S}:F>, posted <t:${NINE_PM_POST_S}:R>.`,
          ),
        ]);
      });
    });

    describe('and the schedule is deleted before they save', () => {
      it.beforeEach(async ({ flow }) => {
        flow.db.delete(SCHEDULE_PATH);
        await click(flow, 'scheduleSave');
      });

      it('says the schedule is gone and stores nothing', ({ flow }) => {
        expect({
          replies: repliesTo(flow, ORGANIZER.id),
          schedules: schedules(flow),
        }).toEqual({
          replies: [privately(ORGANIZER.id, "That schedule doesn't exist.")],
          schedules: [],
        });
      });
    });
  });

  describe('when an organizer moves a paused schedule to Wednesday', () => {
    it.beforeEach(async ({ flow }) => {
      const { nextPostAt: _removedWhilePaused, ...paused } = STORED_SCHEDULE;
      flow.db.seed(SCHEDULE_PATH, { ...paused, paused: true });
      await event(flow, 'schedule-edit', { schedule: SCHEDULE_ID });
      await chooseDays(flow, ['wed']);
      await click(flow, 'scheduleSave');
    });

    it('says it stays paused', ({ flow }) => {
      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        privately(
          ORGANIZER.id,
          `Saved **${TITLE}**: Wed at 8:00 PM Pacific in <#${EVENTS_CHANNEL}>. It's paused, so nothing is posted until it's resumed.`,
        ),
      ]);
    });
  });

  describe("when an organizer picks a schedule that doesn't exist", () => {
    it.beforeEach(({ flow }) =>
      event(flow, 'schedule-edit', { schedule: 'missing' }),
    );

    it('says so, privately', ({ flow }) => {
      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        privately(ORGANIZER.id, "That schedule doesn't exist."),
      ]);
    });
  });

  describe("when an organizer picks another guild's schedule", () => {
    const ELSEWHERE_PATH = 'event-schedules/elsewhere';
    const elsewhere = { ...STORED_SCHEDULE, guildId: OTHER_GUILD };

    it.beforeEach(async ({ flow }) => {
      flow.db.seed(ELSEWHERE_PATH, elsewhere);
      await event(flow, 'schedule-edit', {
        schedule: 'elsewhere',
        time: '9pm',
      });
    });

    it("says it doesn't exist and leaves it as it was", ({ flow }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        schedule: flow.db.read(ELSEWHERE_PATH),
      }).toEqual({
        replies: [privately(ORGANIZER.id, "That schedule doesn't exist.")],
        schedule: elsewhere,
      });
    });
  });

  describe('when an organizer would make sign-ups close as early as it posts', () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(SCHEDULE_PATH, STORED_SCHEDULE);
      await event(flow, 'schedule-edit', {
        schedule: SCHEDULE_ID,
        'post-ahead': 2,
      });
    });

    it('refuses, privately, and keeps the schedule as it was', ({ flow }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        schedule: flow.db.read(SCHEDULE_PATH),
      }).toEqual({
        replies: [privately(ORGANIZER.id, BAD_HOURS)],
        schedule: STORED_SCHEDULE,
      });
    });
  });

  describe('when a member who is not an organizer tries', () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(SCHEDULE_PATH, STORED_SCHEDULE);
      await event(
        flow,
        'schedule-edit',
        { schedule: SCHEDULE_ID, time: '9pm' },
        MEMBER.id,
      );
    });

    it('refuses, privately, and keeps the schedule as it was', ({ flow }) => {
      expect({
        replies: repliesTo(flow, MEMBER.id),
        schedule: flow.db.read(SCHEDULE_PATH),
      }).toEqual({
        replies: [privately(MEMBER.id, 'Only event organizers can do that.')],
        schedule: STORED_SCHEDULE,
      });
    });
  });
});

const MISSING = "That schedule doesn't exist.";
const RECLEAR_PATH = 'event-schedules/schedule-2';
const ELSEWHERE_PATH = 'event-schedules/elsewhere';

const { nextPostAt: _removedWhilePaused, ...UNPOSTED_SCHEDULE } =
  STORED_SCHEDULE;

/** `STORED_SCHEDULE` paused: it keeps `nextStartAt` and loses `nextPostAt`. */
const PAUSED_SCHEDULE: EventScheduleDocument = Object.freeze({
  ...UNPOSTED_SCHEDULE,
  paused: true,
});

/** A paused Sunday 9:30 AM Eastern FRU and TOP schedule in another channel. */
const RECLEAR_SCHEDULE: EventScheduleDocument = Object.freeze({
  ...PAUSED_SCHEDULE,
  title: 'Reclear',
  encounters: [Encounter.FRU, Encounter.TOP],
  channelId: 'reclear-channel',
  weekdays: ['sun'] satisfies Weekday[],
  startTime: '09:30',
  timeZone: USTimeZones.EASTERN,
});

/** Thursday 2026-10-08 at 8 PM Pacific, and a day before it. */
const RESUMED_START_S = seconds('2026-10-09T03:00:00Z');
const RESUMED_POST_S = seconds('2026-10-08T03:00:00Z');

/** `STORED_SCHEDULE`'s times, from last week. */
const LAST_WEEK_START_S = seconds('2026-10-02T03:00:00Z');
const LAST_WEEK_POST_S = seconds('2026-10-01T03:00:00Z');

/** The list's field for `STORED_SCHEDULE`. */
const STORED_FIELD = Object.freeze({
  name: TITLE,
  value: [
    `DMU · <#${EVENTS_CHANNEL}>`,
    'Tue, Thu at 8:00 PM Pacific',
    `Next: <t:${LAST_WEEK_START_S}:F>, posted <t:${LAST_WEEK_POST_S}:R>`,
  ].join('\n'),
});

describe('/event schedule-list', () => {
  describe('when an organizer lists two schedules, one of them paused', () => {
    it.beforeEach(async ({ flow }) => {
      // An id that sorts before `schedule-1`, so only sorting by title puts it last
      flow.db.seed('event-schedules/reclear', RECLEAR_SCHEDULE);
      flow.db.seed(SCHEDULE_PATH, STORED_SCHEDULE);
      flow.db.seed(ELSEWHERE_PATH, {
        ...STORED_SCHEDULE,
        guildId: OTHER_GUILD,
      });
      await event(flow, 'schedule-list', {});
    });

    it("shows this guild's schedules by title, privately", ({ flow }) => {
      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        privateReply(ORGANIZER.id, {
          embeds: [
            {
              title: 'Event schedules',
              fields: [
                STORED_FIELD,
                {
                  name: 'Reclear',
                  value: [
                    'FRU, TOP · <#reclear-channel>',
                    'Sun at 9:30 AM Eastern',
                    'Paused',
                  ].join('\n'),
                },
              ],
            },
          ],
        }),
      ]);
    });
  });

  describe('when an organizer lists more than 25 schedules', () => {
    it.beforeEach(async ({ flow }) => {
      for (let n = 0; n < 27; n++) {
        flow.db.seed(`event-schedules/s${n}`, STORED_SCHEDULE);
      }
      await event(flow, 'schedule-list', {});
    });

    it('shows the first 25 and says how many more there are', ({ flow }) => {
      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        privateReply(ORGANIZER.id, {
          embeds: [
            {
              title: 'Event schedules',
              description: '…and 2 more.',
              fields: Array.from({ length: 25 }, () => STORED_FIELD),
            },
          ],
        }),
      ]);
    });
  });

  describe('when an organizer lists schedules and there are none', () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(ELSEWHERE_PATH, {
        ...STORED_SCHEDULE,
        guildId: OTHER_GUILD,
      });
      await event(flow, 'schedule-list', {});
    });

    it('says how to create one', ({ flow }) => {
      expect(repliesTo(flow, ORGANIZER.id)).toEqual([
        privately(
          ORGANIZER.id,
          'No schedules yet. Create one with /event schedule-create.',
        ),
      ]);
    });
  });

  describe('when a member who is not an organizer tries', () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(SCHEDULE_PATH, STORED_SCHEDULE);
      await event(flow, 'schedule-list', {}, MEMBER.id);
    });

    it('refuses, privately', ({ flow }) => {
      expect(repliesTo(flow, MEMBER.id)).toEqual([
        privately(MEMBER.id, 'Only event organizers can do that.'),
      ]);
    });
  });
});

describe.each(['schedule-pause', 'schedule-resume', 'schedule-delete'])(
  '/event %s',
  (subcommand) => {
    describe('when an organizer looks for a schedule', () => {
      it("offers this guild's matching schedules with their days and time", async ({
        flow,
      }) => {
        flow.db.seed(SCHEDULE_PATH, STORED_SCHEDULE);
        flow.db.seed(RECLEAR_PATH, RECLEAR_SCHEDULE);
        flow.db.seed(ELSEWHERE_PATH, {
          ...RECLEAR_SCHEDULE,
          guildId: OTHER_GUILD,
        });

        const choices = await flow.discord.autocomplete({
          userId: ORGANIZER.id,
          guildId: GUILD,
          commandName: 'event',
          subcommand,
          focused: 'schedule',
          value: 'rec',
        });

        expect(choices).toEqual([
          { name: 'Reclear · Sun 09:30', value: 'schedule-2' },
        ]);
      });
    });

    describe("when an organizer picks a schedule that doesn't exist", () => {
      it.beforeEach(({ flow }) =>
        event(flow, subcommand, { schedule: 'missing' }),
      );

      it('says so, privately', ({ flow }) => {
        expect(repliesTo(flow, ORGANIZER.id)).toEqual([
          privately(ORGANIZER.id, MISSING),
        ]);
      });
    });

    describe("when an organizer picks another guild's schedule", () => {
      const elsewhere = Object.freeze({
        ...PAUSED_SCHEDULE,
        guildId: OTHER_GUILD,
      });

      it.beforeEach(async ({ flow }) => {
        flow.db.seed(ELSEWHERE_PATH, elsewhere);
        await event(flow, subcommand, { schedule: 'elsewhere' });
      });

      it("says it doesn't exist and leaves it as it was", ({ flow }) => {
        expect({
          replies: repliesTo(flow, ORGANIZER.id),
          schedule: flow.db.read(ELSEWHERE_PATH),
        }).toEqual({
          replies: [privately(ORGANIZER.id, MISSING)],
          schedule: elsewhere,
        });
      });
    });

    describe('when a member who is not an organizer tries', () => {
      it.beforeEach(async ({ flow }) => {
        flow.db.seed(SCHEDULE_PATH, PAUSED_SCHEDULE);
        await event(flow, subcommand, { schedule: SCHEDULE_ID }, MEMBER.id);
      });

      it('refuses, privately, and keeps the schedule as it was', ({ flow }) => {
        expect({
          replies: repliesTo(flow, MEMBER.id),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({
          replies: [privately(MEMBER.id, 'Only event organizers can do that.')],
          schedule: PAUSED_SCHEDULE,
        });
      });
    });
  },
);

describe('/event schedule-pause', () => {
  describe('when an organizer pauses a schedule', () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(SCHEDULE_PATH, STORED_SCHEDULE);
      await event(flow, 'schedule-pause', { schedule: SCHEDULE_ID });
    });

    it('stores it paused with no post time, and says so', ({ flow }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        schedule: flow.db.read(SCHEDULE_PATH),
      }).toEqual({
        replies: [privately(ORGANIZER.id, `Paused **${TITLE}**.`)],
        schedule: PAUSED_SCHEDULE,
      });
    });

    describe('and resumes it', () => {
      it.beforeEach(({ flow }) =>
        event(flow, 'schedule-resume', { schedule: SCHEDULE_ID }),
      );

      it('stores the next times from now, and says when the next event is', ({
        flow,
      }) => {
        expect({
          replies: repliesTo(flow, ORGANIZER.id),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({
          replies: [
            privately(ORGANIZER.id, `Paused **${TITLE}**.`),
            privately(
              ORGANIZER.id,
              `Resumed **${TITLE}**. Next event <t:${RESUMED_START_S}:F>.`,
            ),
          ],
          schedule: {
            ...STORED_SCHEDULE,
            nextStartAt: Timestamp.fromMillis(RESUMED_START_S * 1000),
            nextPostAt: Timestamp.fromMillis(RESUMED_POST_S * 1000),
          },
        });
      });
    });
  });

  describe('when an organizer pauses a schedule that is already paused', () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(SCHEDULE_PATH, PAUSED_SCHEDULE);
      await event(flow, 'schedule-pause', { schedule: SCHEDULE_ID });
    });

    it('says so and leaves it as it was', ({ flow }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        schedule: flow.db.read(SCHEDULE_PATH),
      }).toEqual({
        replies: [privately(ORGANIZER.id, `**${TITLE}** is already paused.`)],
        schedule: PAUSED_SCHEDULE,
      });
    });
  });
});

describe('/event schedule-resume', () => {
  describe("when an organizer resumes a schedule that isn't paused", () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(SCHEDULE_PATH, STORED_SCHEDULE);
      await event(flow, 'schedule-resume', { schedule: SCHEDULE_ID });
    });

    it('says so and keeps its due occurrence', ({ flow }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        schedule: flow.db.read(SCHEDULE_PATH),
      }).toEqual({
        replies: [privately(ORGANIZER.id, `**${TITLE}** isn't paused.`)],
        schedule: STORED_SCHEDULE,
      });
    });
  });
});

describe('/event schedule-delete', () => {
  describe('when an organizer deletes a schedule', () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(SCHEDULE_PATH, STORED_SCHEDULE);
      flow.db.seed(RECLEAR_PATH, RECLEAR_SCHEDULE);
      await event(flow, 'schedule-delete', { schedule: SCHEDULE_ID });
    });

    it('removes only that schedule, and says posted events stay', ({
      flow,
    }) => {
      expect({
        replies: repliesTo(flow, ORGANIZER.id),
        schedules: schedules(flow),
      }).toEqual({
        replies: [
          privately(
            ORGANIZER.id,
            `Deleted **${TITLE}**. Events it already posted stay.`,
          ),
        ],
        schedules: [
          { id: 'schedule-2', path: RECLEAR_PATH, data: RECLEAR_SCHEDULE },
        ],
      });
    });
  });
});

describe('the event-scheduler job', () => {
  /** Thursday 2026-10-08 at 8 PM Pacific, a day before it, and 2 hours before it. */
  const START = new Date('2026-10-09T03:00:00Z');
  const POST = new Date('2026-10-08T03:00:00Z');
  const CLOSE = new Date('2026-10-09T01:00:00Z');
  const START_S = START.getTime() / 1000;
  const EVENT_ID = `${SCHEDULE_ID}-${START_S}`;
  const EVENT_PATH = `events/${EVENT_ID}`;

  /** `STORED_SCHEDULE` with Thursday's occurrence next, due at POST. */
  const DUE_SCHEDULE: EventScheduleDocument = Object.freeze({
    ...STORED_SCHEDULE,
    nextStartAt: Timestamp.fromDate(START),
    nextPostAt: Timestamp.fromDate(POST),
  });

  /** `DUE_SCHEDULE` moved on to Tuesday 2026-10-13 at 8 PM Pacific. */
  const ADVANCED_SCHEDULE: EventScheduleDocument = Object.freeze({
    ...DUE_SCHEDULE,
    nextStartAt: Timestamp.fromDate(new Date('2026-10-14T03:00:00Z')),
    nextPostAt: Timestamp.fromDate(new Date('2026-10-13T03:00:00Z')),
  });

  /** Thursday's event as `DUE_SCHEDULE` creates it in `channelId`, before its message is stored. */
  const scheduledEvent = (channelId = EVENTS_CHANNEL): EventDocument => ({
    guildId: GUILD,
    title: TITLE,
    startsAt: Timestamp.fromDate(START),
    signupsCloseAt: Timestamp.fromDate(CLOSE),
    signupsCloseDueAt: Timestamp.fromDate(CLOSE),
    encounters: [Encounter.DMU],
    channelId,
    createdBy: FORMER_ORGANIZER,
    scheduleId: SCHEDULE_ID,
    status: 'open',
  });

  /** Thursday's event message as members see it. */
  const SCHEDULED_MESSAGE = Object.freeze({
    location: { kind: 'channel', guildId: GUILD, channelId: EVENTS_CHANNEL },
    content: undefined,
    embeds: [
      {
        title: TITLE,
        description: [
          `<t:${START_S}:F> (<t:${START_S}:R>)`,
          `Sign-ups close <t:${CLOSE.getTime() / 1000}:R>`,
          `Organized by <@${FORMER_ORGANIZER}>`,
        ].join('\n'),
        fields: [
          { name: '__Dancing Mad (Ultimate)__', value: 'No sign-ups yet' },
        ],
      },
    ],
    components: [eventButtonRow(EVENT_ID, { signup: true, withdraw: true })],
    reactions: {},
    deleted: false,
  });

  function postedMessageId(flow: FlowApp): string {
    const [message, ...others] = flow.discord.channel(EVENTS_CHANNEL);
    if (!message || others.length > 0) {
      throw new Error(`expected one message in ${EVENTS_CHANNEL}`);
    }
    return message.id;
  }

  /** Runs the job's tick at `at`, and the bot finishes with it. */
  async function tickAt(flow: FlowApp, cron: SpiedCron, at: Date) {
    vi.setSystemTime(at);
    await runTick(cron.from);
    await flow.settle();
  }

  describe("when a schedule's post time comes", () => {
    itWithScheduler.beforeEach(async ({ flow, cron }) => {
      flow.db.seed(SCHEDULE_PATH, DUE_SCHEDULE);
      await tickAt(flow, cron, POST);
    });

    itWithScheduler('posts the occurrence', ({ flow }) => {
      expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
        SCHEDULED_MESSAGE,
      ]);
    });

    itWithScheduler(
      'stores the event under the schedule and its start, with its message',
      ({ flow }) => {
        expect(flow.db.documentsIn('events')).toEqual([
          {
            id: EVENT_ID,
            path: EVENT_PATH,
            data: { ...scheduledEvent(), messageId: postedMessageId(flow) },
          },
        ]);
      },
    );

    itWithScheduler('moves the schedule to its next occurrence', ({ flow }) => {
      expect(flow.db.read(SCHEDULE_PATH)).toEqual(ADVANCED_SCHEDULE);
    });

    describe('and the job ticks again at the same time', () => {
      itWithScheduler('posts nothing more', async ({ flow, cron }) => {
        await tickAt(flow, cron, POST);

        expect({
          shown: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({ shown: [SCHEDULED_MESSAGE], schedule: ADVANCED_SCHEDULE });
      });
    });

    describe('and the bot stopped after posting, before moving the schedule on', () => {
      itWithScheduler(
        'posts nothing more, and moves the schedule on',
        async ({ flow, cron }) => {
          const messageId = postedMessageId(flow);
          flow.db.seed(SCHEDULE_PATH, DUE_SCHEDULE);

          await tickAt(flow, cron, POST);

          expect({
            shown: flow.discord.channel(EVENTS_CHANNEL).map(shown),
            event: flow.db.read(EVENT_PATH),
            schedule: flow.db.read(SCHEDULE_PATH),
          }).toEqual({
            shown: [SCHEDULED_MESSAGE],
            event: { ...scheduledEvent(), messageId },
            schedule: ADVANCED_SCHEDULE,
          });
        },
      );
    });
  });

  describe("when a schedule's start passed while the bot was down", () => {
    itWithScheduler(
      'posts nothing, warns, and moves to the following occurrence',
      async ({ flow, cron }) => {
        flow.db.seed(SCHEDULE_PATH, STORED_SCHEDULE);

        await tickAt(flow, cron, NOW);

        flow.expectReported(
          /^warning: .*schedule-1 missed the occurrence at 2026-10-02T03:00:00\.000Z/s,
        );
        expect({
          shown: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          events: flow.db.documentsIn('events'),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({
          shown: [],
          events: [],
          // Tuesday 2026-10-06 at 8 PM Pacific, whose start has passed too
          schedule: {
            ...STORED_SCHEDULE,
            nextStartAt: Timestamp.fromDate(new Date('2026-10-07T03:00:00Z')),
            nextPostAt: Timestamp.fromDate(new Date('2026-10-06T03:00:00Z')),
          },
        });
      },
    );
  });

  describe("when an earlier due schedule's channel was deleted", () => {
    const GONE_ID = 'gone';
    const GONE_CHANNEL = 'deleted-channel';

    itWithScheduler.beforeEach(async ({ flow, cron }) => {
      flow.db.seed(`event-schedules/${GONE_ID}`, {
        ...DUE_SCHEDULE,
        channelId: GONE_CHANNEL,
      });
      flow.db.seed(SCHEDULE_PATH, DUE_SCHEDULE);
      await tickAt(flow, cron, POST);
      flow.expectReported(/^Sentry exception: .*Unknown Channel/s);
      flow.expectReported(/^error: .*schedule gone could not post/s);
    });

    itWithScheduler(
      'stores its event unposted and moves it to its next occurrence',
      ({ flow }) => {
        expect({
          event: flow.db.read(`events/${GONE_ID}-${START_S}`),
          schedule: flow.db.read(`event-schedules/${GONE_ID}`),
        }).toEqual({
          event: { ...scheduledEvent(GONE_CHANNEL), scheduleId: GONE_ID },
          schedule: { ...ADVANCED_SCHEDULE, channelId: GONE_CHANNEL },
        });
      },
    );

    itWithScheduler('still posts the other', ({ flow }) => {
      expect({
        shown: flow.discord.channel(EVENTS_CHANNEL).map(shown),
        schedule: flow.db.read(SCHEDULE_PATH),
      }).toEqual({ shown: [SCHEDULED_MESSAGE], schedule: ADVANCED_SCHEDULE });
    });
  });

  describe('when a paused schedule reaches its old post time', () => {
    itWithScheduler(
      'posts nothing and leaves it paused',
      async ({ flow, cron }) => {
        const { nextPostAt: _removedWhilePaused, ...unposted } = DUE_SCHEDULE;
        const paused = { ...unposted, paused: true };
        flow.db.seed(SCHEDULE_PATH, paused);

        await tickAt(flow, cron, POST);

        expect({
          shown: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          events: flow.db.documentsIn('events'),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({ shown: [], events: [], schedule: paused });
      },
    );
  });

  describe('when an organizer saves a schedule and its post time comes', () => {
    /** Thursday 2026-10-08 at 8 PM Eastern, and a day before it. */
    const EASTERN_START_S = seconds('2026-10-09T00:00:00Z');
    const EASTERN_POST = new Date('2026-10-08T00:00:00Z');

    itWithScheduler('posts the event', async ({ flow, cron }) => {
      await createSchedule(flow, { 'post-ahead': 24 });
      await chooseDays(flow, ['tue', 'thu']);
      await click(flow, 'scheduleSave');

      await tickAt(flow, cron, EASTERN_POST);

      expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
        {
          ...SCHEDULED_MESSAGE,
          embeds: [
            {
              title: TITLE,
              description: [
                `<t:${EASTERN_START_S}:F> (<t:${EASTERN_START_S}:R>)`,
                `Organized by <@${ORGANIZER.id}>`,
              ].join('\n'),
              fields: [
                {
                  name: '__Dancing Mad (Ultimate)__',
                  value: 'No sign-ups yet',
                },
              ],
            },
          ],
          components: [
            eventButtonRow(`${onlyScheduleId(flow)}-${EASTERN_START_S}`, {
              signup: true,
              withdraw: true,
            }),
          ],
        },
      ]);
    });
  });
});
