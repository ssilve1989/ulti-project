import { Encounter } from '@ulti-project/shared';
import { test as base, describe, expect, vi } from 'vitest';
import {
  runTick,
  type SpiedCron,
  spiedCron,
} from '../../test-utils/cron-tick.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import { EventCleanerModule } from './event-cleaner.module.js';

const NOW = new Date('2026-10-20T11:00:00Z');
const WEEK_AGO = new Date('2026-10-13T11:00:00Z');

const it = base.extend<{ cron: SpiedCron; flow: FlowApp }>({
  cron: spiedCron(),
  flow: async ({ cron: _spiedBeforeBoot }, use) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const flow = await createFlowApp({ modules: [EventCleanerModule] });
    try {
      await use(flow);
    } finally {
      await flow.close();
      vi.useRealTimers();
    }
  },
});

/** Seeds event `id` starting at `startsAt`, with one sign-up and one squad's roster. */
function seedEvent(flow: FlowApp, id: string, startsAt: Date) {
  flow.db.seed(`events/${id}`, {
    guildId: 'guild-1',
    title: id,
    startsAt,
    signupsCloseAt: startsAt,
    encounters: [Encounter.FRU],
    channelId: 'events-channel',
    createdBy: 'organizer-1',
    status: 'closed',
  });
  flow.db.seed(`events/${id}/participants/member-1-FRU`, {
    discordId: 'member-1',
    encounter: Encounter.FRU,
  });
  flow.db.seed(`events/${id}/rosters/FRU-squad-1`, {
    encounter: Encounter.FRU,
    squadId: 'squad-1',
    teams: [],
  });
}

const stored = (flow: FlowApp, id: string) => ({
  event: flow.db.read(`events/${id}`)?.title,
  participant: flow.db.read(`events/${id}/participants/member-1-FRU`)
    ?.discordId,
  roster: flow.db.read(`events/${id}/rosters/FRU-squad-1`)?.squadId,
});

describe('when the daily event cleanup runs', () => {
  it('deletes events that started a week or more ago, with their sign-ups and rosters', async ({
    flow,
    cron,
  }) => {
    seedEvent(flow, 'week-old', WEEK_AGO);
    seedEvent(flow, 'six-days-old', new Date(WEEK_AGO.getTime() + 1));

    await runTick(cron.from);

    expect({
      weekOld: stored(flow, 'week-old'),
      sixDaysOld: stored(flow, 'six-days-old'),
    }).toEqual({
      weekOld: { event: undefined, participant: undefined, roster: undefined },
      sixDaysOld: {
        event: 'six-days-old',
        participant: 'member-1',
        roster: 'squad-1',
      },
    });
  });
});
