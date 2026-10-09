import { EventBus } from '@nestjs/cqrs';
import type * as Sentry from '@sentry/nestjs';
import { Encounter } from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect, vi } from 'vitest';
import { USTimeZones } from '../../common/time-zones.js';
import type { Weekday } from '../../events/schedules/next-occurrence.js';
import { ParticipantWithdrawnEvent } from '../../events/signup/events.events.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type {
  EventDocument,
  ParticipantDocument,
} from '../../firebase/models/event.model.js';
import type { EventScheduleDocument } from '../../firebase/models/event-schedule.model.js';
import { EventSchedulerModule } from '../../jobs/event-scheduler/event-scheduler.module.js';
import {
  runTick,
  type SpiedCron,
  spiedCron,
} from '../../test-utils/cron-tick.js';
import { shown } from '../../test-utils/discord/fake-message.js';
import { eventButtonRow, recordChanges } from '../../test-utils/events.js';
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

/** Runs the event-scheduler job's tick at `at`, and the bot finishes with it. */
async function tickAt(flow: FlowApp, cron: SpiedCron, at: Date) {
  vi.setSystemTime(at);
  await runTick(cron.from);
  await flow.settle();
}

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

/** The organizer's latest reply: the panel of the command they ran last. */
function panel(flow: FlowApp) {
  const reply = flow.discord.repliesTo(ORGANIZER.id).at(-1);
  if (!reply) throw new Error('expected the organizer to have a reply');
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
    `Dancing Mad (Ultimate) · <#${EVENTS_CHANNEL}>`,
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
                    '[FRU] Futures Rewritten, [TOP] The Omega Protocol · <#reclear-channel>',
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

  describe('when the occurrence is already posted under another id', () => {
    itWithScheduler(
      'posts nothing and moves the schedule on',
      async ({ flow, cron }) => {
        const moved: EventDocument = {
          ...scheduledEvent(),
          messageId: 'message-0',
        };
        flow.db.seed('events/moved-event', moved);
        flow.db.seed(SCHEDULE_PATH, DUE_SCHEDULE);

        await tickAt(flow, cron, POST);

        expect({
          shown: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          events: flow.db.documentsIn('events'),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({
          shown: [],
          events: [
            { id: 'moved-event', path: 'events/moved-event', data: moved },
          ],
          schedule: ADVANCED_SCHEDULE,
        });
      },
    );
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
      'keeps no event for it and moves it to its next occurrence',
      ({ flow }) => {
        expect({
          events: flow.db.documentsIn('events').map(({ id }) => id),
          schedule: flow.db.read(`event-schedules/${GONE_ID}`),
        }).toEqual({
          events: [EVENT_ID],
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

  /** Runs the job's tick at `at`: `completed`, or the error it failed with. */
  const tickOutcome = (flow: FlowApp, cron: SpiedCron, at: Date) =>
    tickAt(flow, cron, at).then(
      () => 'completed',
      (error: unknown) => error,
    );

  describe("when an earlier due schedule's event can't be created", () => {
    const GONE_ID = 'gone';

    itWithScheduler(
      'reports it, leaves it on the occurrence to retry, and still posts the other',
      async ({ flow, cron }) => {
        flow.db.seed(`event-schedules/${GONE_ID}`, DUE_SCHEDULE);
        flow.db.seed(SCHEDULE_PATH, DUE_SCHEDULE);
        flow.db.contend(`events/${GONE_ID}-${START_S}`);

        const tick = await tickOutcome(flow, cron, POST);

        expect({
          tick,
          shown: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          goneEvent: flow.db.read(`events/${GONE_ID}-${START_S}`),
          goneSchedule: flow.db.read(`event-schedules/${GONE_ID}`),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({
          tick: 'completed',
          shown: [SCHEDULED_MESSAGE],
          goneEvent: undefined,
          goneSchedule: DUE_SCHEDULE,
          schedule: ADVANCED_SCHEDULE,
        });
        flow.expectReported(/^Sentry exception: .*ABORTED/s);
        flow.expectReported(/^error: .*schedule gone could not be handled/s);
      },
    );
  });

  describe("when an earlier due schedule can't be moved on", () => {
    const GONE_ID = 'gone';
    const GONE_PATH = `event-schedules/${GONE_ID}`;
    const GONE_EVENT_ID = `${GONE_ID}-${START_S}`;
    const OTHER_CHANNEL = 'other-channel';

    itWithScheduler(
      'posts its occurrence, reports it, leaves it on the occurrence, and still posts the other',
      async ({ flow, cron }) => {
        flow.discord.addChannel(GUILD, OTHER_CHANNEL);
        flow.db.seed(GONE_PATH, { ...DUE_SCHEDULE, channelId: OTHER_CHANNEL });
        flow.db.seed(SCHEDULE_PATH, DUE_SCHEDULE);
        flow.db.contend(GONE_PATH);

        const tick = await tickOutcome(flow, cron, POST);

        const [gonePost] = flow.discord.channel(OTHER_CHANNEL);
        expect({
          tick,
          goneShown: flow.discord.channel(OTHER_CHANNEL).map(shown),
          goneEvent: flow.db.read(`events/${GONE_EVENT_ID}`),
          goneSchedule: flow.db.read(GONE_PATH),
          shown: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({
          tick: 'completed',
          goneShown: [
            {
              ...SCHEDULED_MESSAGE,
              location: {
                kind: 'channel',
                guildId: GUILD,
                channelId: OTHER_CHANNEL,
              },
              components: [
                eventButtonRow(GONE_EVENT_ID, { signup: true, withdraw: true }),
              ],
            },
          ],
          goneEvent: {
            ...scheduledEvent(OTHER_CHANNEL),
            scheduleId: GONE_ID,
            messageId: gonePost?.id,
          },
          goneSchedule: { ...DUE_SCHEDULE, channelId: OTHER_CHANNEL },
          shown: [SCHEDULED_MESSAGE],
          schedule: ADVANCED_SCHEDULE,
        });
        flow.expectReported(/^Sentry exception: .*ABORTED/s);
        flow.expectReported(/^error: .*schedule gone could not be handled/s);
      },
    );
  });

  describe('when an organizer saves a schedule and its post time comes', () => {
    /** Thursday 2026-10-08 at 8 PM Eastern. */
    const EASTERN_START_S = seconds('2026-10-09T00:00:00Z');

    itWithScheduler.beforeEach(async ({ flow, cron }) => {
      await createSchedule(flow, { 'post-ahead': 24 });
      await chooseDays(flow, ['tue', 'thu']);
      await click(flow, 'scheduleSave');
      const nextPostAt = flow.db.read(
        `event-schedules/${onlyScheduleId(flow)}`,
      )?.nextPostAt;
      if (!(nextPostAt instanceof Timestamp)) {
        throw new Error('the saved schedule has no post time');
      }
      await tickAt(flow, cron, nextPostAt.toDate());
    });

    itWithScheduler('posts the event', ({ flow }) => {
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

    itWithScheduler(
      'moves the schedule to Tuesday 8 PM Eastern, posted a day ahead',
      ({ flow }) => {
        expect(flow.db.read(`event-schedules/${onlyScheduleId(flow)}`)).toEqual(
          {
            guildId: GUILD,
            title: TITLE,
            encounters: [Encounter.DMU],
            channelId: EVENTS_CHANNEL,
            weekdays: ['tue', 'thu'],
            startTime: '20:00',
            timeZone: USTimeZones.EASTERN,
            postLeadHours: 24,
            signupsCloseBeforeHours: 0,
            paused: false,
            nextStartAt: Timestamp.fromDate(new Date('2026-10-14T00:00:00Z')),
            nextPostAt: Timestamp.fromDate(new Date('2026-10-13T00:00:00Z')),
            createdBy: ORGANIZER.id,
            updatedBy: ORGANIZER.id,
          } satisfies EventScheduleDocument,
        );
      },
    );
  });
});

describe('/event schedule-edit, after the schedule posted an event', () => {
  const ALICE = Object.freeze({ id: 'alice', username: 'alice' });
  const BOB = Object.freeze({ id: 'bob', username: 'bob' });
  const CAROL = Object.freeze({ id: 'carol', username: 'carol' });
  const RAID_CHANNEL = 'raid-channel';

  /** Thursday 2026-10-08 at 8 PM Pacific, a day before it, and 2 hours before it. */
  const START = new Date('2026-10-09T03:00:00Z');
  const POST = new Date('2026-10-08T03:00:00Z');
  const CLOSE = new Date('2026-10-09T01:00:00Z');
  /** Thursday 2026-10-08 at 9 AM Pacific. */
  const EDITED_AT = new Date('2026-10-08T16:00:00Z');
  const EVENT_ID = `${SCHEDULE_ID}-${START.getTime() / 1000}`;
  const EVENT_PATH = `events/${EVENT_ID}`;
  const at = (iso: string) => Timestamp.fromDate(new Date(iso));

  /** A Tue/Thu 8 PM Pacific DMU and TOP schedule, due to post Thursday's event. */
  const DMU_TOP_SCHEDULE: EventScheduleDocument = Object.freeze({
    ...STORED_SCHEDULE,
    encounters: [Encounter.DMU, Encounter.TOP],
    nextStartAt: Timestamp.fromDate(START),
    nextPostAt: Timestamp.fromDate(POST),
  });

  /** `DMU_TOP_SCHEDULE` once it posted Thursday's event: on to Tuesday 8 PM Pacific. */
  const ADVANCED_START = at('2026-10-14T03:00:00Z');
  const ADVANCED_POST = at('2026-10-13T03:00:00Z');
  const ADVANCED_SCHEDULE: EventScheduleDocument = Object.freeze({
    ...DMU_TOP_SCHEDULE,
    nextStartAt: ADVANCED_START,
    nextPostAt: ADVANCED_POST,
  });

  /** Thursday's event as the schedule posted it, without its message id. */
  const POSTED_EVENT: EventDocument = Object.freeze({
    guildId: GUILD,
    title: TITLE,
    startsAt: Timestamp.fromDate(START),
    signupsCloseAt: Timestamp.fromDate(CLOSE),
    signupsCloseDueAt: Timestamp.fromDate(CLOSE),
    encounters: [Encounter.DMU, Encounter.TOP],
    channelId: EVENTS_CHANNEL,
    createdBy: FORMER_ORGANIZER,
    scheduleId: SCHEDULE_ID,
    status: 'open',
  });

  const CLAIM = Object.freeze({
    squadId: 'squad-1',
    claimedBy: ORGANIZER.id,
    claimedAt: Timestamp.fromDate(POST),
  });

  const ALICE_DMU = Object.freeze<ParticipantDocument>({
    discordId: ALICE.id,
    encounter: Encounter.DMU,
    job: 'SGE',
    character: 'alice',
    world: 'gilgamesh',
    phase: { roleId: 'dmu-p4', label: 'DMU P4', order: 3, bucket: 'prog' },
    signedUpAt: Timestamp.fromDate(POST),
    claim: CLAIM,
  });

  const BOB_TOP = Object.freeze<ParticipantDocument>({
    discordId: BOB.id,
    encounter: Encounter.TOP,
    job: 'WAR',
    character: 'bob bobson',
    world: 'jenova',
    phase: { roleId: 'top-p2', label: 'TOP P2', order: 1, bucket: 'prog' },
    signedUpAt: Timestamp.fromDate(POST),
  });

  const CAROL_TOP = Object.freeze<ParticipantDocument>({
    ...BOB_TOP,
    discordId: CAROL.id,
    job: 'WHM',
    character: 'carol',
  });

  const DMU_NAME = 'Dancing Mad (Ultimate)';
  const TOP_NAME = '[TOP] The Omega Protocol';

  /** An encounter's header field, with how many signed up. */
  const encounterField = (name: string, count: number) => ({
    name: `__${name}__`,
    value: count ? `${count} signed up` : 'No sign-ups yet',
  });

  const NO_SIGNUPS = Object.freeze([
    encounterField(DMU_NAME, 0),
    encounterField(TOP_NAME, 0),
  ]);
  const ALICE_FIELDS = Object.freeze([
    encounterField(DMU_NAME, 1),
    { name: 'DMU P4 (1)', value: `\`SGE\` <@${ALICE.id}> Alice@Gilgamesh` },
  ]);
  const TOP_FIELDS = Object.freeze([
    encounterField(TOP_NAME, 2),
    {
      name: 'TOP P2 (2)',
      value: [
        `\`WAR\` <@${BOB.id}> Bob Bobson@Jenova`,
        `\`WHM\` <@${CAROL.id}> Carol@Jenova`,
      ].join('\n'),
    },
  ]);

  const closesAt = (date: Date) =>
    `Sign-ups close <t:${date.getTime() / 1000}:R>`;

  /** The event's post as members see it. */
  const eventPost = ({
    title = TITLE,
    start = START,
    signups = closesAt(CLOSE),
    fields = NO_SIGNUPS,
    signup = true,
    channelId = EVENTS_CHANNEL,
    eventId = EVENT_ID,
  }: {
    title?: string;
    start?: Date;
    signups?: string;
    fields?: readonly object[];
    signup?: boolean;
    channelId?: string;
    eventId?: string;
  } = {}) => ({
    location: { kind: 'channel', guildId: GUILD, channelId },
    content: undefined,
    embeds: [
      {
        title,
        description: [
          `<t:${start.getTime() / 1000}:F> (<t:${start.getTime() / 1000}:R>)`,
          signups,
          `Organized by <@${FORMER_ORGANIZER}>`,
        ].join('\n'),
        fields,
      },
    ],
    components: [eventButtonRow(eventId, { signup, withdraw: true })],
    reactions: {},
    deleted: false,
  });

  const dm = (userId: string, content: string) => ({
    location: { kind: 'dm', userId },
    content,
    embeds: [],
    components: [],
    reactions: {},
    deleted: false,
  });

  function thePost(flow: FlowApp) {
    const [message, ...others] = flow.discord.channel(EVENTS_CHANNEL);
    if (!message || others.length > 0) {
      throw new Error(`expected one message in ${EVENTS_CHANNEL}`);
    }
    return message;
  }

  function seedSignups(flow: FlowApp) {
    for (const participant of [ALICE_DMU, BOB_TOP, CAROL_TOP]) {
      flow.db.seed(
        `${EVENT_PATH}/participants/${participant.discordId}-${participant.encounter}`,
        participant,
      );
    }
  }

  const participants = (flow: FlowApp) =>
    flow.db.documentsIn(`${EVENT_PATH}/participants`).map(({ data }) => data);

  /** The summary's first line for the schedule still on Tue/Thu 8 PM Pacific, next posting on Tuesday. */
  const savedEightPm = ({
    title = TITLE,
    channelId = EVENTS_CHANNEL,
  }: {
    title?: string;
    channelId?: string;
  } = {}) =>
    `Saved **${title}**: Tue, Thu at 8:00 PM Pacific in <#${channelId}>. Next event <t:${ADVANCED_START.seconds}:F>, posted <t:${ADVANCED_POST.seconds}:R>.`;

  /** The organizer edits the schedule with `options`, picks `days` if given, and saves. */
  async function edit(
    flow: FlowApp,
    options: Record<string, string | number>,
    days?: readonly Weekday[],
  ) {
    await event(flow, 'schedule-edit', { schedule: SCHEDULE_ID, ...options });
    if (days) await chooseDays(flow, days);
    await click(flow, 'scheduleSave');
  }

  /** What the organizer is told: the saved schedule, then the posted events line. */
  const summary = (saved: string, posted: string) =>
    privately(ORGANIZER.id, `${saved}\n${posted}`);

  /** Every event the app publishes while `act` runs. */
  async function publishedDuring(flow: FlowApp, act: () => Promise<void>) {
    const published: unknown[] = [];
    const subscription = flow
      .get(EventBus)
      .subscribe((event) => published.push(event));
    try {
      await act();
    } finally {
      subscription.unsubscribe();
    }
    return published;
  }

  itWithScheduler.beforeEach(async ({ flow, cron }) => {
    flow.discord.addChannel(GUILD, RAID_CHANNEL);
    for (const member of [ALICE, BOB, CAROL]) flow.discord.addMember(member);
    flow.db.seed(SCHEDULE_PATH, DMU_TOP_SCHEDULE);
    await tickAt(flow, cron, POST);
    vi.setSystemTime(EDITED_AT);
  });

  describe('when an organizer moves it from Thursday 8 PM to Wednesday 9 PM', () => {
    /** Wednesday 2026-10-14 at 9 PM Pacific, and 2 hours before it. */
    const WEDNESDAY = new Date('2026-10-15T04:00:00Z');
    const WEDNESDAY_CLOSE = new Date('2026-10-15T02:00:00Z');
    /** A day before Wednesday's event. */
    const WEDNESDAY_POST = new Date('2026-10-14T04:00:00Z');
    /** The Wednesday after it, and a day before that. */
    const NEXT_WEDNESDAY = at('2026-10-22T04:00:00Z');
    const NEXT_WEDNESDAY_POST = at('2026-10-21T04:00:00Z');
    /** The schedule on Wednesdays at 9 PM, past the moved event's Wednesday. */
    const WEDNESDAY_SCHEDULE = Object.freeze({
      ...DMU_TOP_SCHEDULE,
      weekdays: ['wed'],
      startTime: '21:00',
      nextStartAt: NEXT_WEDNESDAY,
      nextPostAt: NEXT_WEDNESDAY_POST,
      updatedBy: ORGANIZER.id,
    });

    const moveToWednesday = (flow: FlowApp) =>
      edit(flow, { time: '9pm' }, ['wed']);

    itWithScheduler(
      'moves the event to Wednesday 9 PM and updates its post in place',
      async ({ flow }) => {
        const post = thePost(flow);

        await moveToWednesday(flow);

        const moved = eventPost({
          start: WEDNESDAY,
          signups: closesAt(WEDNESDAY_CLOSE),
        });
        expect({
          post: shown(post),
          posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          event: flow.db.read(EVENT_PATH),
        }).toEqual({
          post: moved,
          posts: [moved],
          event: {
            ...POSTED_EVENT,
            startsAt: Timestamp.fromDate(WEDNESDAY),
            signupsCloseAt: Timestamp.fromDate(WEDNESDAY_CLOSE),
            signupsCloseDueAt: Timestamp.fromDate(WEDNESDAY_CLOSE),
            messageId: post.id,
          },
        });
      },
    );

    itWithScheduler(
      'moves the schedule on to the Wednesday after, past the moved event, and says one posted event was updated',
      async ({ flow }) => {
        await moveToWednesday(flow);

        expect({
          schedule: flow.db.read(SCHEDULE_PATH),
          replies: repliesTo(flow, ORGANIZER.id),
        }).toEqual({
          schedule: WEDNESDAY_SCHEDULE,
          replies: [
            summary(
              `Saved **${TITLE}**: Wed at 9:00 PM Pacific in <#${EVENTS_CHANNEL}>. Next event <t:${NEXT_WEDNESDAY.seconds}:F>, posted <t:${NEXT_WEDNESDAY_POST.seconds}:R>.`,
              'Updated 1 posted event.',
            ),
          ],
        });
      },
    );

    describe("and the job ticks when Wednesday's event would be posted", () => {
      itWithScheduler('posts nothing more', async ({ flow, cron }) => {
        await moveToWednesday(flow);
        const post = thePost(flow);

        await tickAt(flow, cron, WEDNESDAY_POST);

        expect({
          posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          events: flow.db.documentsIn('events'),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({
          posts: [
            eventPost({ start: WEDNESDAY, signups: closesAt(WEDNESDAY_CLOSE) }),
          ],
          events: [
            {
              id: EVENT_ID,
              path: EVENT_PATH,
              data: {
                ...POSTED_EVENT,
                startsAt: Timestamp.fromDate(WEDNESDAY),
                signupsCloseAt: Timestamp.fromDate(WEDNESDAY_CLOSE),
                signupsCloseDueAt: Timestamp.fromDate(WEDNESDAY_CLOSE),
                messageId: post.id,
              },
            },
          ],
          schedule: WEDNESDAY_SCHEDULE,
        });
      });
    });
  });

  describe('when an organizer moves it from Thursday to Wednesday, then adds Thursday back', () => {
    /** Wednesday 2026-10-14 at 8 PM Pacific, 2 hours before it, and a day before it. */
    const WEDNESDAY = new Date('2026-10-15T03:00:00Z');
    const WEDNESDAY_CLOSE = new Date('2026-10-15T01:00:00Z');
    const WEDNESDAY_POST = new Date('2026-10-14T03:00:00Z');

    itWithScheduler(
      "posts Thursday's occurrence as a new event when the job ticks, and keeps the moved one on Wednesday",
      async ({ flow, cron }) => {
        await edit(flow, {}, ['wed']);
        await edit(flow, {}, ['wed', 'thu']);

        // Thursday's post time has passed, so the next tick posts it
        await tickAt(flow, cron, new Date(EDITED_AT.getTime() + 60_000));

        const events = flow.db.documentsIn('events');
        // the new event's id is generated
        const newId = events.find(({ id }) => id !== EVENT_ID)?.id ?? 'none';
        const [wednesdayPost, thursdayPost] =
          flow.discord.channel(EVENTS_CHANNEL);
        expect({
          posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          events: Object.fromEntries(events.map(({ id, data }) => [id, data])),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({
          posts: [
            eventPost({ start: WEDNESDAY, signups: closesAt(WEDNESDAY_CLOSE) }),
            eventPost({ eventId: newId }),
          ],
          events: {
            [EVENT_ID]: {
              ...POSTED_EVENT,
              startsAt: Timestamp.fromDate(WEDNESDAY),
              signupsCloseAt: Timestamp.fromDate(WEDNESDAY_CLOSE),
              signupsCloseDueAt: Timestamp.fromDate(WEDNESDAY_CLOSE),
              messageId: wednesdayPost?.id,
            },
            [newId]: { ...POSTED_EVENT, messageId: thursdayPost?.id },
          },
          // on to the moved event's Wednesday, which the next tick skips
          schedule: {
            ...DMU_TOP_SCHEDULE,
            weekdays: ['wed', 'thu'],
            nextStartAt: Timestamp.fromDate(WEDNESDAY),
            nextPostAt: Timestamp.fromDate(WEDNESDAY_POST),
            updatedBy: ORGANIZER.id,
          },
        });
      },
    );
  });

  describe('when an organizer renames it', () => {
    itWithScheduler.beforeEach(({ flow }) =>
      edit(flow, { title: 'DMU reclear' }),
    );

    itWithScheduler('renames the event and its post', ({ flow }) => {
      expect({
        posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
        event: flow.db.read(EVENT_PATH),
      }).toEqual({
        posts: [eventPost({ title: 'DMU reclear' })],
        event: {
          ...POSTED_EVENT,
          title: 'DMU reclear',
          messageId: thePost(flow).id,
        },
      });
    });

    itWithScheduler(
      'keeps the schedule on Tuesday, past the posted Thursday',
      ({ flow }) => {
        expect(flow.db.read(SCHEDULE_PATH)).toEqual({
          ...ADVANCED_SCHEDULE,
          title: 'DMU reclear',
          updatedBy: ORGANIZER.id,
        });
      },
    );
  });

  describe("when an organizer renames it and its post can't be updated", () => {
    itWithScheduler(
      'still renames the event, reports the failed update, and says it was updated',
      async ({ flow }) => {
        flow.discord.failGuildFetches();

        await edit(flow, { title: 'DMU reclear' });

        flow.expectReported(/^Sentry exception: .*Internal Server Error/s);
        flow.expectReported(
          new RegExp(
            `^error: .*Failed to refresh event ${EVENT_ID} after its schedule was edited`,
            's',
          ),
        );
        expect({
          posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          event: flow.db.read(EVENT_PATH),
          replies: repliesTo(flow, ORGANIZER.id),
        }).toEqual({
          posts: [eventPost()],
          event: {
            ...POSTED_EVENT,
            title: 'DMU reclear',
            messageId: thePost(flow).id,
          },
          replies: [
            summary(
              savedEightPm({ title: 'DMU reclear' }),
              'Updated 1 posted event.',
            ),
          ],
        });
      },
    );
  });

  describe('when an organizer moves it from 8 PM to 9 PM', () => {
    /** Thursday 2026-10-08 at 9 PM Pacific, and 2 hours before it. */
    const NINE_PM = new Date('2026-10-09T04:00:00Z');
    const NINE_PM_CLOSE = new Date('2026-10-09T02:00:00Z');
    /** Tuesday 2026-10-13 at 9 PM Pacific, and a day before it. */
    const TUESDAY_NINE = new Date('2026-10-14T04:00:00Z');
    const TUESDAY_NINE_POST = new Date('2026-10-13T04:00:00Z');

    itWithScheduler(
      'keeps the event on Thursday at 9 PM, with sign-ups closing 2 hours before it, and moves the schedule on to Tuesday',
      async ({ flow }) => {
        await edit(flow, { time: '9pm' });

        expect({
          posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          event: flow.db.read(EVENT_PATH),
          schedule: flow.db.read(SCHEDULE_PATH),
          replies: repliesTo(flow, ORGANIZER.id),
        }).toEqual({
          posts: [
            eventPost({ start: NINE_PM, signups: closesAt(NINE_PM_CLOSE) }),
          ],
          event: {
            ...POSTED_EVENT,
            startsAt: Timestamp.fromDate(NINE_PM),
            signupsCloseAt: Timestamp.fromDate(NINE_PM_CLOSE),
            signupsCloseDueAt: Timestamp.fromDate(NINE_PM_CLOSE),
            messageId: thePost(flow).id,
          },
          schedule: {
            ...DMU_TOP_SCHEDULE,
            startTime: '21:00',
            nextStartAt: Timestamp.fromDate(TUESDAY_NINE),
            nextPostAt: Timestamp.fromDate(TUESDAY_NINE_POST),
            updatedBy: ORGANIZER.id,
          },
          replies: [
            summary(
              `Saved **${TITLE}**: Tue, Thu at 9:00 PM Pacific in <#${EVENTS_CHANNEL}>. Next event <t:${TUESDAY_NINE.getTime() / 1000}:F>, posted <t:${TUESDAY_NINE_POST.getTime() / 1000}:R>.`,
              'Updated 1 posted event.',
            ),
          ],
        });
      },
    );
  });

  describe('when an organizer moves it to 10 PM, then to Eastern and adds Friday', () => {
    /**
     * Thursday 2026-10-08 at 10 PM Eastern, and 2 hours before it. At 10 PM
     * Pacific the event was already Friday in Eastern.
     */
    const TEN_PM_EASTERN = new Date('2026-10-09T02:00:00Z');
    const TEN_PM_EASTERN_CLOSE = new Date('2026-10-09T00:00:00Z');

    itWithScheduler(
      'keeps the event on the Thursday members signed up for, at 10 PM Eastern',
      async ({ flow }) => {
        await edit(flow, { time: '10pm' });
        await event(flow, 'schedule-edit', { schedule: SCHEDULE_ID });
        await chooseZone(flow, USTimeZones.EASTERN);
        await chooseDays(flow, ['tue', 'thu', 'fri']);
        await click(flow, 'scheduleSave');

        expect({
          posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          event: flow.db.read(EVENT_PATH),
        }).toEqual({
          posts: [
            eventPost({
              start: TEN_PM_EASTERN,
              signups: closesAt(TEN_PM_EASTERN_CLOSE),
            }),
          ],
          event: {
            ...POSTED_EVENT,
            startsAt: Timestamp.fromDate(TEN_PM_EASTERN),
            signupsCloseAt: Timestamp.fromDate(TEN_PM_EASTERN_CLOSE),
            signupsCloseDueAt: Timestamp.fromDate(TEN_PM_EASTERN_CLOSE),
            messageId: thePost(flow).id,
          },
        });
      },
    );
  });

  describe('when the schedule has posted two upcoming events, Thursday and Tuesday', () => {
    /** Tuesday 2026-10-13 at 8 PM Pacific, and its event. */
    const TUESDAY = new Date('2026-10-14T03:00:00Z');
    const TUESDAY_ID = `${SCHEDULE_ID}-${TUESDAY.getTime() / 1000}`;
    /** Posting a week ahead, so Tuesday's event is posted by now too. */
    const WEEK_AHEAD_SCHEDULE: EventScheduleDocument = Object.freeze({
      ...ADVANCED_SCHEDULE,
      postLeadHours: 168,
      nextPostAt: at('2026-10-07T03:00:00Z'),
    });
    const TWO_HOURS = 2 * 3_600_000;

    /** Both posts and stored events, Thursday's event starting at `thursday` and Tuesday's at `tuesday`. */
    function bothEvents(flow: FlowApp, thursday: Date, tuesday: Date) {
      const [thursdayPost, tuesdayPost] = flow.discord.channel(EVENTS_CHANNEL);
      const closing = (start: Date) => new Date(start.getTime() - TWO_HOURS);
      const stored = (start: Date, messageId: string | undefined) => ({
        ...POSTED_EVENT,
        startsAt: Timestamp.fromDate(start),
        signupsCloseAt: Timestamp.fromDate(closing(start)),
        signupsCloseDueAt: Timestamp.fromDate(closing(start)),
        messageId,
      });
      return {
        posts: [
          eventPost({ start: thursday, signups: closesAt(closing(thursday)) }),
          eventPost({
            start: tuesday,
            signups: closesAt(closing(tuesday)),
            eventId: TUESDAY_ID,
          }),
        ],
        events: [
          {
            id: EVENT_ID,
            path: EVENT_PATH,
            data: stored(thursday, thursdayPost?.id),
          },
          {
            id: TUESDAY_ID,
            path: `events/${TUESDAY_ID}`,
            data: stored(tuesday, tuesdayPost?.id),
          },
        ],
      };
    }

    const actual = (flow: FlowApp) => ({
      posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
      events: flow.db.documentsIn('events'),
      schedule: flow.db.read(SCHEDULE_PATH),
    });

    itWithScheduler.beforeEach(async ({ flow, cron }) => {
      flow.db.seed(SCHEDULE_PATH, WEEK_AHEAD_SCHEDULE);
      await tickAt(flow, cron, EDITED_AT);
    });

    describe('and an organizer moves it to 9 PM', () => {
      /** Thursday and Tuesday at 9 PM Pacific. */
      const THURSDAY_NINE = new Date('2026-10-09T04:00:00Z');
      const TUESDAY_NINE = new Date('2026-10-14T04:00:00Z');

      itWithScheduler(
        'keeps each on its own day at 9 PM, and moves the schedule on past both',
        async ({ flow }) => {
          await edit(flow, { time: '9pm' });

          expect(actual(flow)).toEqual({
            ...bothEvents(flow, THURSDAY_NINE, TUESDAY_NINE),
            // Thursday 2026-10-15 at 9 PM Pacific, and a week before it
            schedule: {
              ...WEEK_AHEAD_SCHEDULE,
              startTime: '21:00',
              nextStartAt: at('2026-10-16T04:00:00Z'),
              nextPostAt: at('2026-10-09T04:00:00Z'),
              updatedBy: ORGANIZER.id,
            },
          });
        },
      );
    });

    describe('and an organizer moves it to 8 AM, past on Thursday', () => {
      /** Tuesday 2026-10-13 and Thursday 2026-10-15 at 8 AM Pacific. */
      const TUESDAY_EIGHT = new Date('2026-10-13T15:00:00Z');
      const NEXT_THURSDAY_EIGHT = new Date('2026-10-15T15:00:00Z');

      itWithScheduler(
        "keeps Tuesday's event and moves Thursday's to the next free day",
        async ({ flow }) => {
          await edit(flow, { time: '8am' });

          expect(actual(flow)).toEqual({
            ...bothEvents(flow, NEXT_THURSDAY_EIGHT, TUESDAY_EIGHT),
            // Tuesday 2026-10-20 at 8 AM Pacific, past both, and a week before it
            schedule: {
              ...WEEK_AHEAD_SCHEDULE,
              startTime: '08:00',
              nextStartAt: at('2026-10-20T15:00:00Z'),
              nextPostAt: at('2026-10-13T15:00:00Z'),
              updatedBy: ORGANIZER.id,
            },
          });
        },
      );
    });
  });

  describe('when the schedule also has an event on Wednesday that was closed early, and an organizer moves it from Thursday to Wednesday', () => {
    /** Wednesday 2026-10-14 at 8 PM Pacific, and 2 hours before it. */
    const { signupsCloseDueAt: _closedIsNotDue, ...notDue } = POSTED_EVENT;
    const CLOSED_WEDNESDAY: EventDocument = Object.freeze({
      ...notDue,
      startsAt: at('2026-10-15T03:00:00Z'),
      signupsCloseAt: at('2026-10-15T01:00:00Z'),
      status: 'closed',
      messageId: 'closed-message',
    });
    /** The Wednesday after it at 8 PM Pacific, and 2 hours before it. */
    const NEXT_WEDNESDAY = new Date('2026-10-22T03:00:00Z');
    const NEXT_WEDNESDAY_CLOSE = new Date('2026-10-22T01:00:00Z');

    itWithScheduler(
      'moves the event past the closed one, and the schedule past both',
      async ({ flow }) => {
        flow.db.seed('events/closed-wednesday', CLOSED_WEDNESDAY);

        await edit(flow, {}, ['wed']);

        expect({
          posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          closed: flow.db.read('events/closed-wednesday'),
          moved: flow.db.read(EVENT_PATH),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({
          posts: [
            eventPost({
              start: NEXT_WEDNESDAY,
              signups: closesAt(NEXT_WEDNESDAY_CLOSE),
            }),
          ],
          closed: CLOSED_WEDNESDAY,
          moved: {
            ...POSTED_EVENT,
            startsAt: Timestamp.fromDate(NEXT_WEDNESDAY),
            signupsCloseAt: Timestamp.fromDate(NEXT_WEDNESDAY_CLOSE),
            signupsCloseDueAt: Timestamp.fromDate(NEXT_WEDNESDAY_CLOSE),
            messageId: thePost(flow).id,
          },
          // Wednesday 2026-10-28 at 8 PM Pacific, and a day before it
          schedule: {
            ...DMU_TOP_SCHEDULE,
            weekdays: ['wed'],
            nextStartAt: at('2026-10-29T03:00:00Z'),
            nextPostAt: at('2026-10-28T03:00:00Z'),
            updatedBy: ORGANIZER.id,
          },
        });
      },
    );
  });

  describe('when an organizer removes TOP from it', () => {
    const removeTop = (flow: FlowApp) =>
      edit(flow, { 'encounter-1': Encounter.DMU });

    itWithScheduler.beforeEach(({ flow }) => seedSignups(flow));

    itWithScheduler(
      'deletes the TOP sign-ups, keeps the DMU one with its claim, and tells the board',
      async ({ flow }) => {
        const published = await publishedDuring(flow, () => removeTop(flow));

        expect({ participants: participants(flow), published }).toEqual({
          participants: [ALICE_DMU],
          published: [
            new ParticipantWithdrawnEvent(
              EVENT_ID,
              { ...BOB_TOP, id: `${BOB.id}-TOP` },
              'encounter-removed',
            ),
            new ParticipantWithdrawnEvent(
              EVENT_ID,
              { ...CAROL_TOP, id: `${CAROL.id}-TOP` },
              'encounter-removed',
            ),
          ],
        });
      },
    );

    itWithScheduler(
      'tells a board open on the event that it changed, then each removed sign-up',
      async ({ flow }) => {
        const changes = recordChanges(flow, EVENT_ID);

        await removeTop(flow);

        expect(changes).toEqual([
          { kind: 'event', eventId: EVENT_ID },
          {
            kind: 'participant',
            eventId: EVENT_ID,
            participantId: `${BOB.id}-TOP`,
          },
          {
            kind: 'participant',
            eventId: EVENT_ID,
            participantId: `${CAROL.id}-TOP`,
          },
        ]);
      },
    );

    itWithScheduler(
      'tells each member whose sign-up was removed',
      async ({ flow }) => {
        await removeTop(flow);

        const removed = `**${TOP_NAME}** was removed from **${TITLE}**, so your sign-up for it was cancelled.`;
        expect({
          alice: flow.discord.dmsTo(ALICE.id).map(shown),
          bob: flow.discord.dmsTo(BOB.id).map(shown),
          carol: flow.discord.dmsTo(CAROL.id).map(shown),
        }).toEqual({
          alice: [],
          bob: [dm(BOB.id, removed)],
          carol: [dm(CAROL.id, removed)],
        });
      },
    );

    itWithScheduler(
      'shows the post without TOP, and counts the removed sign-ups',
      async ({ flow }) => {
        await removeTop(flow);

        expect({
          posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          event: flow.db.read(EVENT_PATH),
          replies: repliesTo(flow, ORGANIZER.id),
        }).toEqual({
          posts: [eventPost({ fields: ALICE_FIELDS })],
          event: {
            ...POSTED_EVENT,
            encounters: [Encounter.DMU],
            messageId: thePost(flow).id,
          },
          replies: [
            summary(
              savedEightPm(),
              'Updated 1 posted event (2 sign-ups removed from TOP).',
            ),
          ],
        });
      },
    );

    describe('and a squad had claimed a member whose sign-up it removes', () => {
      const MOD_CHANNEL = 'mod-channel';

      itWithScheduler(
        'alerts the moderators that the claimed player was removed',
        async ({ flow }) => {
          flow.discord.addChannel(GUILD, MOD_CHANNEL);
          await flow.get(SettingsCollection).upsert(GUILD, {
            autoModChannelId: MOD_CHANNEL,
            squads: {
              [CLAIM.squadId]: {
                name: 'Frogs',
                tag: 'FRG',
                color: '#16a34a',
                roleId: 'frogs-role',
              },
            },
          });
          flow.db.seed(`${EVENT_PATH}/participants/${BOB.id}-TOP`, {
            ...BOB_TOP,
            claim: CLAIM,
          });

          await removeTop(flow);

          expect(flow.discord.channel(MOD_CHANNEL).map(shown)).toEqual([
            {
              location: {
                kind: 'channel',
                guildId: GUILD,
                channelId: MOD_CHANNEL,
              },
              content: undefined,
              embeds: [
                {
                  title: 'Claimed player removed',
                  fields: [
                    { name: 'Player', value: `<@${BOB.id}> Bob Bobson@Jenova` },
                    { name: 'Job', value: '`WAR` Warrior' },
                    { name: 'Phase', value: 'TOP P2' },
                    {
                      name: 'Event',
                      value: `[${TITLE}](https://discord.com/channels/${GUILD}/${EVENTS_CHANNEL}/${thePost(flow).id}) · <t:${START.getTime() / 1000}:F>`,
                    },
                    { name: 'Encounter', value: TOP_NAME },
                    { name: 'Squad', value: 'Frogs (FRG)' },
                    {
                      name: 'Claimed by',
                      value: `<@${ORGANIZER.id}> <t:${POST.getTime() / 1000}:R>`,
                    },
                    {
                      name: 'Withdrew',
                      value: `<t:${EDITED_AT.getTime() / 1000}:R>`,
                    },
                  ],
                },
              ],
              components: [],
              allowedMentions: { parse: [] },
              reactions: {},
              deleted: false,
            },
          ]);
        },
      );
    });

    describe('and a member whose sign-up is removed has closed DMs', () => {
      itWithScheduler(
        'removes it anyway, tells the others, and logs the failed DM',
        async ({ flow }) => {
          flow.discord.failDirectMessagesTo(BOB.id);

          await removeTop(flow);

          flow.expectReported(/^warning: .*bob.*TOP.*Cannot send messages/s);
          expect({
            participants: participants(flow),
            bob: flow.discord.dmsTo(BOB.id),
            carol: flow.discord.dmsTo(CAROL.id).map(shown),
            replies: repliesTo(flow, ORGANIZER.id),
          }).toEqual({
            participants: [ALICE_DMU],
            bob: [],
            carol: [
              dm(
                CAROL.id,
                `**${TOP_NAME}** was removed from **${TITLE}**, so your sign-up for it was cancelled.`,
              ),
            ],
            replies: [
              summary(
                savedEightPm(),
                'Updated 1 posted event (2 sign-ups removed from TOP).',
              ),
            ],
          });
        },
      );
    });
  });

  describe('when an organizer moves it to another channel', () => {
    itWithScheduler.beforeEach(({ flow }) => seedSignups(flow));

    itWithScheduler(
      'posts it there with its sign-ups, and deletes the old post',
      async ({ flow }) => {
        const oldPost = thePost(flow);

        await edit(flow, { channel: RAID_CHANNEL });

        const newPosts = flow.discord.channel(RAID_CHANNEL);
        expect({
          oldPost: shown(oldPost),
          newPosts: newPosts.map(shown),
          event: flow.db.read(EVENT_PATH),
          participants: participants(flow),
          replies: repliesTo(flow, ORGANIZER.id),
        }).toEqual({
          oldPost: { ...eventPost(), deleted: true },
          newPosts: [
            eventPost({
              channelId: RAID_CHANNEL,
              fields: [...ALICE_FIELDS, ...TOP_FIELDS],
            }),
          ],
          event: {
            ...POSTED_EVENT,
            channelId: RAID_CHANNEL,
            messageId: newPosts[0]?.id,
          },
          participants: [ALICE_DMU, BOB_TOP, CAROL_TOP],
          replies: [
            summary(
              savedEightPm({ channelId: RAID_CHANNEL }),
              'Updated 1 posted event.',
            ),
          ],
        });
      },
    );

    itWithScheduler(
      'tells a board open on the event that it changed, and again once it moved',
      async ({ flow }) => {
        const changes = recordChanges(flow, EVENT_ID);

        await edit(flow, { channel: RAID_CHANNEL });

        expect(changes).toEqual([
          { kind: 'event', eventId: EVENT_ID },
          { kind: 'event', eventId: EVENT_ID },
        ]);
      },
    );

    describe('and the bot may not send messages there', () => {
      itWithScheduler(
        'tells a board open on the event only that it changed',
        async ({ flow }) => {
          flow.discord.denySendingIn(RAID_CHANNEL);
          const changes = recordChanges(flow, EVENT_ID);

          await edit(flow, { channel: RAID_CHANNEL });

          flow.expectReported(/^Sentry exception: .*Missing Permissions/s);
          flow.expectReported(
            new RegExp(`^error: .*event ${EVENT_ID} could not be moved`, 's'),
          );
          expect(changes).toEqual([{ kind: 'event', eventId: EVENT_ID }]);
        },
      );

      itWithScheduler(
        'keeps the event in its old channel, reports it, and says it could not be moved',
        async ({ flow }) => {
          flow.discord.denySendingIn(RAID_CHANNEL);
          const messageId = thePost(flow).id;

          await edit(flow, { channel: RAID_CHANNEL });

          flow.expectReported(/^Sentry exception: .*Missing Permissions/s);
          flow.expectReported(
            new RegExp(`^error: .*event ${EVENT_ID} could not be moved`, 's'),
          );
          expect({
            posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
            raidPosts: flow.discord.channel(RAID_CHANNEL),
            event: flow.db.read(EVENT_PATH),
            replies: repliesTo(flow, ORGANIZER.id),
          }).toEqual({
            posts: [eventPost({ fields: [...ALICE_FIELDS, ...TOP_FIELDS] })],
            raidPosts: [],
            event: { ...POSTED_EVENT, messageId },
            replies: [
              summary(
                savedEightPm({ channelId: RAID_CHANNEL }),
                `Updated 1 posted event; 1 couldn't be moved to <#${RAID_CHANNEL}>.`,
              ),
            ],
          });
        },
      );
    });
  });

  describe('when sign-ups have closed and an organizer moves it later', () => {
    /** Thursday 2026-10-08 at 6:30 PM Pacific, after sign-ups closed at 6 PM. */
    const AFTER_CLOSE = new Date('2026-10-09T01:30:00Z');
    /** Thursday at 9 PM Pacific, and 2 hours before it. */
    const NINE_PM = new Date('2026-10-09T04:00:00Z');
    const NINE_PM_CLOSE = new Date('2026-10-09T02:00:00Z');

    itWithScheduler(
      'reopens sign-ups until the new cutoff, with Sign up enabled',
      async ({ flow, cron }) => {
        await tickAt(flow, cron, CLOSE);
        vi.setSystemTime(AFTER_CLOSE);

        await edit(flow, { time: '9pm' });

        expect({
          posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          event: flow.db.read(EVENT_PATH),
        }).toEqual({
          posts: [
            eventPost({ start: NINE_PM, signups: closesAt(NINE_PM_CLOSE) }),
          ],
          event: {
            ...POSTED_EVENT,
            startsAt: Timestamp.fromDate(NINE_PM),
            signupsCloseAt: Timestamp.fromDate(NINE_PM_CLOSE),
            signupsCloseDueAt: Timestamp.fromDate(NINE_PM_CLOSE),
            messageId: thePost(flow).id,
          },
        });
      },
    );
  });

  describe('when an organizer moves its cutoff to a time that has passed', () => {
    /** Thursday 2026-10-08 at 5:30 PM Pacific, before sign-ups close at 6 PM. */
    const BEFORE_CLOSE = new Date('2026-10-09T00:30:00Z');

    itWithScheduler('closes sign-ups', async ({ flow }) => {
      vi.setSystemTime(BEFORE_CLOSE);

      await edit(flow, { 'signups-close-before': 3 });

      const { signupsCloseDueAt: _noLongerDue, ...closed } = POSTED_EVENT;
      expect({
        posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
        event: flow.db.read(EVENT_PATH),
      }).toEqual({
        posts: [eventPost({ signups: 'Sign-ups closed', signup: false })],
        event: {
          ...closed,
          status: 'signups-closed',
          signupsCloseAt: at('2026-10-09T00:00:00Z'),
          messageId: thePost(flow).id,
        },
      });
    });
  });

  describe('when the schedule also has an event that started and one that is closed', () => {
    const STARTED: EventDocument = Object.freeze({
      ...POSTED_EVENT,
      startsAt: Timestamp.fromDate(new Date(EDITED_AT.getTime() - 60_000)),
    });
    const { signupsCloseDueAt: _closedIsNotDue, ...notDue } = POSTED_EVENT;
    const CLOSED: EventDocument = Object.freeze({
      ...notDue,
      status: 'closed',
    });

    itWithScheduler(
      'updates only the posted one, and leaves those alone',
      async ({ flow }) => {
        flow.db.seed('events/started', STARTED);
        flow.db.seed('events/closed', CLOSED);

        await edit(flow, { title: 'DMU reclear' });

        expect({
          started: flow.db.read('events/started'),
          closed: flow.db.read('events/closed'),
          posted: flow.db.read(EVENT_PATH),
          replies: repliesTo(flow, ORGANIZER.id),
        }).toEqual({
          started: STARTED,
          closed: CLOSED,
          posted: {
            ...POSTED_EVENT,
            title: 'DMU reclear',
            messageId: thePost(flow).id,
          },
          replies: [
            summary(
              savedEightPm({ title: 'DMU reclear' }),
              'Updated 1 posted event.',
            ),
          ],
        });
      },
    );
  });

  describe('when the schedule is paused and an organizer moves it to 9 PM', () => {
    /** Thursday at 9 PM Pacific, and 2 hours before it. */
    const NINE_PM = new Date('2026-10-09T04:00:00Z');
    const NINE_PM_CLOSE = new Date('2026-10-09T02:00:00Z');
    const { nextPostAt: _removedWhilePaused, ...unposted } = ADVANCED_SCHEDULE;

    itWithScheduler(
      'moves the event, and keeps the schedule paused past it',
      async ({ flow }) => {
        flow.db.seed(SCHEDULE_PATH, { ...unposted, paused: true });

        await edit(flow, { time: '9pm' });

        expect({
          event: flow.db.read(EVENT_PATH),
          schedule: flow.db.read(SCHEDULE_PATH),
          replies: repliesTo(flow, ORGANIZER.id),
        }).toEqual({
          event: {
            ...POSTED_EVENT,
            startsAt: Timestamp.fromDate(NINE_PM),
            signupsCloseAt: Timestamp.fromDate(NINE_PM_CLOSE),
            signupsCloseDueAt: Timestamp.fromDate(NINE_PM_CLOSE),
            messageId: thePost(flow).id,
          },
          // Tuesday 2026-10-13 at 9 PM Pacific
          schedule: {
            ...unposted,
            paused: true,
            startTime: '21:00',
            nextStartAt: at('2026-10-14T04:00:00Z'),
            updatedBy: ORGANIZER.id,
          },
          replies: [
            summary(
              `Saved **${TITLE}**: Tue, Thu at 9:00 PM Pacific in <#${EVENTS_CHANNEL}>. It's paused, so nothing is posted until it's resumed.`,
              'Updated 1 posted event.',
            ),
          ],
        });
      },
    );
  });

  describe('when the schedule is paused, the event moved to 9 PM, and the schedule resumed', () => {
    /** Thursday at 9 PM Pacific, and 2 hours before it. */
    const NINE_PM = new Date('2026-10-09T04:00:00Z');
    const NINE_PM_CLOSE = new Date('2026-10-09T02:00:00Z');
    const { nextPostAt: _removedWhilePaused, ...unposted } = ADVANCED_SCHEDULE;

    itWithScheduler(
      "doesn't post the moved occurrence again when the job ticks",
      async ({ flow, cron }) => {
        flow.db.seed(SCHEDULE_PATH, { ...unposted, paused: true });
        await edit(flow, { time: '9pm' });
        await event(flow, 'schedule-resume', { schedule: SCHEDULE_ID });

        await tickAt(flow, cron, new Date(EDITED_AT.getTime() + 60_000));

        expect({
          posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          events: flow.db.documentsIn('events').map(({ id }) => id),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({
          posts: [
            eventPost({ start: NINE_PM, signups: closesAt(NINE_PM_CLOSE) }),
          ],
          events: [EVENT_ID],
          // Tuesday 2026-10-13 at 9 PM Pacific, and a day before it
          schedule: {
            ...unposted,
            startTime: '21:00',
            nextStartAt: at('2026-10-14T04:00:00Z'),
            nextPostAt: at('2026-10-13T04:00:00Z'),
            updatedBy: ORGANIZER.id,
          },
        });
      },
    );
  });

  describe('when an organizer pauses the schedule', () => {
    itWithScheduler('leaves the posted event alone', async ({ flow }) => {
      await event(flow, 'schedule-pause', { schedule: SCHEDULE_ID });

      expect({
        posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
        event: flow.db.read(EVENT_PATH),
      }).toEqual({
        posts: [eventPost()],
        event: { ...POSTED_EVENT, messageId: thePost(flow).id },
      });
    });
  });
});

describe('/event schedule-edit, adding a day before a posted event', () => {
  const ALICE = Object.freeze({ id: 'alice', username: 'alice' });
  /** Thursday 2026-10-15 at 8 PM Pacific, posted 72 hours ahead on Monday, and 2 hours before it. */
  const THURSDAY = new Date('2026-10-16T03:00:00Z');
  const THURSDAY_POST = new Date('2026-10-13T03:00:00Z');
  const THURSDAY_CLOSE = new Date('2026-10-16T01:00:00Z');
  const THURSDAY_ID = `${SCHEDULE_ID}-${THURSDAY.getTime() / 1000}`;
  /** Tuesday 2026-10-13 at 8 PM Pacific, 72 hours before it, and 2 hours before it. */
  const TUESDAY = new Date('2026-10-14T03:00:00Z');
  const TUESDAY_POST = new Date('2026-10-11T03:00:00Z');
  const TUESDAY_CLOSE = new Date('2026-10-14T01:00:00Z');
  const TUESDAY_ID = `${SCHEDULE_ID}-${TUESDAY.getTime() / 1000}`;
  /** Monday 2026-10-12 at 9 PM Pacific, an hour after Thursday's event was posted. */
  const EDITED_AT = new Date('2026-10-13T04:00:00Z');
  const at = (date: Date) => Timestamp.fromDate(date);

  /** A Thursday 8 PM Pacific DMU schedule posting 72 hours ahead, due to post Thursday's event. */
  const THURSDAY_SCHEDULE: EventScheduleDocument = Object.freeze({
    ...STORED_SCHEDULE,
    weekdays: ['thu'] satisfies Weekday[],
    postLeadHours: 72,
    nextStartAt: at(THURSDAY),
    nextPostAt: at(THURSDAY_POST),
  });

  const ALICE_DMU = Object.freeze<ParticipantDocument>({
    discordId: ALICE.id,
    encounter: Encounter.DMU,
    job: 'SGE',
    character: 'alice',
    world: 'gilgamesh',
    phase: { roleId: 'dmu-p4', label: 'DMU P4', order: 3, bucket: 'prog' },
    signedUpAt: at(THURSDAY_POST),
  });
  const ALICE_PATH = `events/${THURSDAY_ID}/participants/${ALICE.id}-${Encounter.DMU}`;

  /** An event's post as members see it. */
  const eventPost = (
    eventId: string,
    start: Date,
    close: Date,
    fields: readonly object[],
  ) => ({
    location: { kind: 'channel', guildId: GUILD, channelId: EVENTS_CHANNEL },
    content: undefined,
    embeds: [
      {
        title: TITLE,
        description: [
          `<t:${start.getTime() / 1000}:F> (<t:${start.getTime() / 1000}:R>)`,
          `Sign-ups close <t:${close.getTime() / 1000}:R>`,
          `Organized by <@${FORMER_ORGANIZER}>`,
        ].join('\n'),
        fields,
      },
    ],
    components: [eventButtonRow(eventId, { signup: true, withdraw: true })],
    reactions: {},
    deleted: false,
  });

  const THURSDAY_POSTED = eventPost(THURSDAY_ID, THURSDAY, THURSDAY_CLOSE, [
    { name: '__Dancing Mad (Ultimate)__', value: '1 signed up' },
    { name: 'DMU P4 (1)', value: `\`SGE\` <@${ALICE.id}> Alice@Gilgamesh` },
  ]);
  const TUESDAY_POSTED = eventPost(TUESDAY_ID, TUESDAY, TUESDAY_CLOSE, [
    { name: '__Dancing Mad (Ultimate)__', value: 'No sign-ups yet' },
  ]);

  /** The stored event at `start`, as the schedule posted it in message `messageId`. */
  const storedEvent = (
    id: string,
    start: Date,
    close: Date,
    messageId: string | undefined,
  ) => ({
    id,
    path: `events/${id}`,
    data: {
      guildId: GUILD,
      title: TITLE,
      startsAt: at(start),
      signupsCloseAt: at(close),
      signupsCloseDueAt: at(close),
      encounters: [Encounter.DMU],
      channelId: EVENTS_CHANNEL,
      createdBy: FORMER_ORGANIZER,
      scheduleId: SCHEDULE_ID,
      status: 'open',
      messageId,
    },
  });

  const messageIds = (flow: FlowApp) =>
    flow.discord.channel(EVENTS_CHANNEL).map(({ id }) => id);

  /** The schedule on Tue/Thu, its next occurrence starting at `start` and posted at `post`. */
  const tueThuSchedule = (start: Date, post: Date) => ({
    ...THURSDAY_SCHEDULE,
    weekdays: ['tue', 'thu'],
    nextStartAt: at(start),
    nextPostAt: at(post),
    updatedBy: ORGANIZER.id,
  });

  /** The job ticks `minutes` after the edit. */
  const tickAfterEdit = (flow: FlowApp, cron: SpiedCron, minutes: number) =>
    tickAt(flow, cron, new Date(EDITED_AT.getTime() + minutes * 60_000));

  itWithScheduler.beforeEach(async ({ flow, cron }) => {
    flow.discord.addMember(ALICE);
    flow.db.seed(SCHEDULE_PATH, THURSDAY_SCHEDULE);
    await tickAt(flow, cron, THURSDAY_POST);
    flow.db.seed(ALICE_PATH, ALICE_DMU);
    vi.setSystemTime(EDITED_AT);
    await event(flow, 'schedule-edit', { schedule: SCHEDULE_ID });
    await chooseDays(flow, ['tue', 'thu']);
    await click(flow, 'scheduleSave');
  });

  itWithScheduler(
    'keeps the posted event on Thursday with its sign-ups',
    ({ flow }) => {
      const [thursdayPost] = messageIds(flow);
      expect({
        posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
        events: flow.db.documentsIn('events'),
        signup: flow.db.read(ALICE_PATH),
      }).toEqual({
        posts: [THURSDAY_POSTED],
        events: [
          storedEvent(THURSDAY_ID, THURSDAY, THURSDAY_CLOSE, thursdayPost),
        ],
        signup: ALICE_DMU,
      });
    },
  );

  itWithScheduler(
    'moves the schedule on to Tuesday, and says one posted event was updated',
    ({ flow }) => {
      expect({
        schedule: flow.db.read(SCHEDULE_PATH),
        replies: repliesTo(flow, ORGANIZER.id),
      }).toEqual({
        schedule: tueThuSchedule(TUESDAY, TUESDAY_POST),
        replies: [
          privately(
            ORGANIZER.id,
            `Saved **${TITLE}**: Tue, Thu at 8:00 PM Pacific in <#${EVENTS_CHANNEL}>. Next event <t:${TUESDAY.getTime() / 1000}:F>, posted <t:${TUESDAY_POST.getTime() / 1000}:R>.\nUpdated 1 posted event.`,
          ),
        ],
      });
    },
  );

  describe('and the job ticks', () => {
    itWithScheduler(
      'posts a new Tuesday event, and leaves Thursday as it was',
      async ({ flow, cron }) => {
        await tickAfterEdit(flow, cron, 1);

        const [thursdayPost, tuesdayPost] = messageIds(flow);
        expect({
          posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
          events: flow.db.documentsIn('events'),
          schedule: flow.db.read(SCHEDULE_PATH),
        }).toEqual({
          posts: [THURSDAY_POSTED, TUESDAY_POSTED],
          events: [
            storedEvent(THURSDAY_ID, THURSDAY, THURSDAY_CLOSE, thursdayPost),
            storedEvent(TUESDAY_ID, TUESDAY, TUESDAY_CLOSE, tuesdayPost),
          ],
          schedule: tueThuSchedule(THURSDAY, THURSDAY_POST),
        });
      },
    );

    describe("and ticks again for Thursday's occurrence", () => {
      itWithScheduler(
        'posts nothing for Thursday, and moves the schedule on to the next Tuesday',
        async ({ flow, cron }) => {
          await tickAfterEdit(flow, cron, 1);
          await tickAfterEdit(flow, cron, 2);

          const [thursdayPost, tuesdayPost] = messageIds(flow);
          expect({
            posts: flow.discord.channel(EVENTS_CHANNEL).map(shown),
            events: flow.db.documentsIn('events'),
            schedule: flow.db.read(SCHEDULE_PATH),
          }).toEqual({
            posts: [THURSDAY_POSTED, TUESDAY_POSTED],
            events: [
              storedEvent(THURSDAY_ID, THURSDAY, THURSDAY_CLOSE, thursdayPost),
              storedEvent(TUESDAY_ID, TUESDAY, TUESDAY_CLOSE, tuesdayPost),
            ],
            // Tuesday 2026-10-20 at 8 PM Pacific, and 72 hours before it
            schedule: tueThuSchedule(
              new Date('2026-10-21T03:00:00Z'),
              new Date('2026-10-18T03:00:00Z'),
            ),
          });
        },
      );
    });
  });
});
