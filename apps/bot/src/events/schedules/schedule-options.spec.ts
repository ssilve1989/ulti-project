import { Encounter } from '@ulti-project/shared';
import { test as base, describe, expect } from 'vitest';
import { USTimeZones } from '../../common/time-zones.js';
import type { ScheduleSettings } from '../../firebase/models/event-schedule.model.js';
import { EventSlashCommand } from '../../slash-commands/event/event.slash-command.js';
import { DiscordMock } from '../../test-utils/discord/discord-mock.js';
import { fresh } from '../../test-utils/fixtures.js';
import type { Weekday } from './next-occurrence.js';
import {
  readScheduleChanges,
  readScheduleOptions,
} from './schedule-options.js';

const GUILD = 'guild-1';
const HERE = 'command-channel';
const ELSEWHERE = 'other-channel';
const USER = 'organizer-1';

const BAD_TIME = "I couldn't read that time. Try 20:00, 8pm or 8:30 pm.";
const BAD_HOURS =
  'Sign-ups must close less than post-ahead hours before the start.';

const it = base.extend<{ discord: DiscordMock }>({
  discord: fresh(() => {
    const discord = new DiscordMock();
    discord.addChannel(GUILD, HERE);
    discord.addChannel(GUILD, ELSEWHERE);
    discord.addMember({ id: USER, username: 'organizer' });
    discord.registerCommands([EventSlashCommand]);
    return discord;
  }),
});

/** The interaction for `/event <subcommand>` run in HERE with `options`. */
const run = (
  discord: DiscordMock,
  subcommand: string,
  options: Record<string, string | number>,
) =>
  discord.command({
    userId: USER,
    guildId: GUILD,
    channelId: HERE,
    commandName: 'event',
    subcommand,
    options,
  }).interaction;

const REQUIRED = Object.freeze({
  title: 'DMU prog night',
  'encounter-1': Encounter.DMU,
  time: '8pm',
});

const CURRENT: ScheduleSettings = Object.freeze({
  title: 'FRU prog night',
  encounters: [Encounter.FRU],
  channelId: HERE,
  weekdays: ['tue'] satisfies Weekday[],
  startTime: '20:00',
  timeZone: USTimeZones.EASTERN,
  postLeadHours: 24,
  signupsCloseBeforeHours: 2,
});

describe('readScheduleOptions', () => {
  describe('when only the required options are given', () => {
    it('defaults to posting 72 hours ahead, closing at the start, in this channel', ({
      discord,
    }) => {
      expect(
        readScheduleOptions(run(discord, 'schedule-create', REQUIRED)),
      ).toEqual({
        ok: true,
        values: {
          title: 'DMU prog night',
          encounters: [Encounter.DMU],
          startTime: '20:00',
          postLeadHours: 72,
          signupsCloseBeforeHours: 0,
          channelId: HERE,
        },
      });
    });
  });

  describe('when every option is given, with an encounter twice', () => {
    it('reads each one, and the encounter once', ({ discord }) => {
      const interaction = run(discord, 'schedule-create', {
        ...REQUIRED,
        time: '8:30 pm',
        'post-ahead': 48,
        'signups-close-before': 47,
        channel: ELSEWHERE,
        'encounter-4': Encounter.DMU,
      });

      expect(readScheduleOptions(interaction)).toEqual({
        ok: true,
        values: {
          title: 'DMU prog night',
          encounters: [Encounter.DMU],
          startTime: '20:30',
          postLeadHours: 48,
          signupsCloseBeforeHours: 47,
          channelId: ELSEWHERE,
        },
      });
    });
  });

  describe('when the time has no am/pm or minutes', () => {
    it('asks for a time it can read', ({ discord }) => {
      const interaction = run(discord, 'schedule-create', {
        ...REQUIRED,
        time: '8',
      });

      expect(readScheduleOptions(interaction)).toEqual({
        ok: false,
        message: BAD_TIME,
      });
    });
  });

  describe('when sign-ups close as many hours before the start as it posts', () => {
    it('says sign-ups must close later', ({ discord }) => {
      const interaction = run(discord, 'schedule-create', {
        ...REQUIRED,
        'signups-close-before': 72,
      });

      expect(readScheduleOptions(interaction)).toEqual({
        ok: false,
        message: BAD_HOURS,
      });
    });
  });
});

describe('readScheduleChanges', () => {
  describe('when no options are given', () => {
    it('changes nothing', ({ discord }) => {
      const interaction = run(discord, 'schedule-edit', { schedule: 's1' });

      expect(readScheduleChanges(interaction, CURRENT)).toEqual({
        ok: true,
        values: {},
      });
    });
  });

  describe('when every option is given', () => {
    it('changes each one, with the encounters given replacing the old ones', ({
      discord,
    }) => {
      const interaction = run(discord, 'schedule-edit', {
        schedule: 's1',
        title: 'Reclear',
        time: '21:15',
        'post-ahead': 6,
        'signups-close-before': 1,
        channel: ELSEWHERE,
        'encounter-2': Encounter.DMU,
      });

      expect(readScheduleChanges(interaction, CURRENT)).toEqual({
        ok: true,
        values: {
          title: 'Reclear',
          encounters: [Encounter.DMU],
          startTime: '21:15',
          postLeadHours: 6,
          signupsCloseBeforeHours: 1,
          channelId: ELSEWHERE,
        },
      });
    });
  });

  describe('when the time cannot be read', () => {
    it('asks for a time it can read', ({ discord }) => {
      const interaction = run(discord, 'schedule-edit', {
        schedule: 's1',
        time: '25:00',
      });

      expect(readScheduleChanges(interaction, CURRENT)).toEqual({
        ok: false,
        message: BAD_TIME,
      });
    });
  });

  describe('when post-ahead drops to the hours sign-ups already close before', () => {
    it('says sign-ups must close later', ({ discord }) => {
      const interaction = run(discord, 'schedule-edit', {
        schedule: 's1',
        'post-ahead': 2,
      });

      expect(readScheduleChanges(interaction, CURRENT)).toEqual({
        ok: false,
        message: BAD_HOURS,
      });
    });
  });

  describe('when sign-ups would close earlier than the schedule already posts', () => {
    it('says sign-ups must close later', ({ discord }) => {
      const interaction = run(discord, 'schedule-edit', {
        schedule: 's1',
        'signups-close-before': 30,
      });

      expect(readScheduleChanges(interaction, CURRENT)).toEqual({
        ok: false,
        message: BAD_HOURS,
      });
    });
  });
});
