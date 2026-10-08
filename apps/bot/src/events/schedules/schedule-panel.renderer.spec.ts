import { Encounter } from '@ulti-project/shared';
import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { USTimeZones } from '../../common/time-zones.js';
import type { Weekday } from './next-occurrence.js';
import {
  describeRecurrence,
  renderSchedulePanel,
  type ScheduleDraft,
} from './schedule-panel.renderer.js';

/** Monday 2026-07-13, noon Eastern (EDT). */
const JULY_NOW = new Date('2026-07-13T16:00:00Z');
/** Monday 2026-01-12, noon Eastern (EST). */
const JANUARY_NOW = new Date('2026-01-12T17:00:00Z');

function aDraft(overrides: Partial<ScheduleDraft> = {}): ScheduleDraft {
  return {
    title: 'DSR prog night',
    encounters: [Encounter.DSR, Encounter.TOP],
    channelId: 'channel-1',
    weekdays: [],
    startTime: '20:00',
    timeZone: USTimeZones.EASTERN,
    postLeadHours: 72,
    signupsCloseBeforeHours: 0,
    ...overrides,
  };
}

function render(draft: ScheduleDraft, now: Date, mode: 'create' | 'edit') {
  const { embeds, components } = renderSchedulePanel(draft, now, mode);
  return {
    embeds: embeds.map((embed) => embed.toJSON()),
    components: components.map((row) => row.toJSON()),
  };
}

const DAY_LABELS = Object.freeze([
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
] as const);

function daysRow(selected: readonly Weekday[]) {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.StringSelect,
        custom_id: 'scheduleDays',
        min_values: 1,
        max_values: 7,
        options: DAY_LABELS.map(([value, label]) => ({
          label,
          value,
          default: selected.includes(value),
        })),
      },
    ],
  };
}

function zoneRow(
  labels: readonly [string, string, string, string],
  selected: string,
) {
  const zones = [
    USTimeZones.EASTERN,
    USTimeZones.CENTRAL,
    USTimeZones.MOUNTAIN,
    USTimeZones.PACIFIC,
  ];
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.StringSelect,
        custom_id: 'scheduleZone',
        options: zones.map((value, index) => ({
          label: labels[index],
          value,
          default: value === selected,
        })),
      },
    ],
  };
}

const SUMMER_LABELS = Object.freeze([
  'Eastern (UTC−4)',
  'Central (UTC−5)',
  'Mountain (UTC−6)',
  'Pacific (UTC−7)',
] as const);

function buttonRow(saveDisabled: boolean) {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        custom_id: 'scheduleSave',
        label: 'Save',
        style: ButtonStyle.Primary,
        disabled: saveDisabled,
      },
      {
        type: ComponentType.Button,
        custom_id: 'scheduleCancel',
        label: 'Cancel',
        style: ButtonStyle.Secondary,
      },
    ],
  };
}

describe('renderSchedulePanel', () => {
  describe('when a new schedule has no days picked yet', () => {
    it('asks for a day and disables Save', () => {
      expect(render(aDraft(), JULY_NOW, 'create')).toEqual({
        embeds: [
          {
            title: 'New schedule: DSR prog night',
            description: 'Pick at least one day.',
            fields: [
              {
                name: 'Encounters',
                value: '[DSR] Dragonsong Reprise\n[TOP] The Omega Protocol',
              },
              { name: 'Channel', value: '<#channel-1>' },
              { name: 'Post ahead', value: '72 hours' },
            ],
          },
        ],
        components: [
          daysRow([]),
          zoneRow(SUMMER_LABELS, USTimeZones.EASTERN),
          buttonRow(true),
        ],
      });
    });
  });

  describe('when Tue and Thu are picked in Eastern with a sign-up gap', () => {
    it('previews the next event and enables Save', () => {
      const draft = aDraft({
        weekdays: ['thu', 'tue'],
        postLeadHours: 24,
        signupsCloseBeforeHours: 2,
      });
      expect(render(draft, JULY_NOW, 'create')).toEqual({
        embeds: [
          {
            title: 'New schedule: DSR prog night',
            description: [
              'Tue, Thu at 8:00 PM Eastern.',
              'The next event starts <t:1784073600:F> and is posted <t:1783987200:R>.',
              'Sign-ups close 2 hours before it starts (<t:1784066400:R>).',
            ].join('\n'),
            fields: [
              {
                name: 'Encounters',
                value: '[DSR] Dragonsong Reprise\n[TOP] The Omega Protocol',
              },
              { name: 'Channel', value: '<#channel-1>' },
              { name: 'Post ahead', value: '24 hours' },
            ],
          },
        ],
        components: [
          daysRow(['tue', 'thu']),
          zoneRow(SUMMER_LABELS, USTimeZones.EASTERN),
          buttonRow(false),
        ],
      });
    });
  });

  describe('when sign-ups close one hour before the start', () => {
    it('says 1 hour', () => {
      const draft = aDraft({
        weekdays: ['tue', 'thu'],
        postLeadHours: 24,
        signupsCloseBeforeHours: 1,
      });
      expect(render(draft, JULY_NOW, 'create')).toEqual({
        embeds: [
          {
            title: 'New schedule: DSR prog night',
            description: [
              'Tue, Thu at 8:00 PM Eastern.',
              'The next event starts <t:1784073600:F> and is posted <t:1783987200:R>.',
              'Sign-ups close 1 hour before it starts (<t:1784070000:R>).',
            ].join('\n'),
            fields: [
              {
                name: 'Encounters',
                value: '[DSR] Dragonsong Reprise\n[TOP] The Omega Protocol',
              },
              { name: 'Channel', value: '<#channel-1>' },
              { name: 'Post ahead', value: '24 hours' },
            ],
          },
        ],
        components: [
          daysRow(['tue', 'thu']),
          zoneRow(SUMMER_LABELS, USTimeZones.EASTERN),
          buttonRow(false),
        ],
      });
    });
  });

  describe('when an existing Pacific schedule is edited', () => {
    it('selects Pacific and says sign-ups close when it starts', () => {
      const draft = aDraft({
        encounters: [Encounter.FRU],
        weekdays: ['sat'],
        timeZone: USTimeZones.PACIFIC,
        postLeadHours: 1,
      });
      expect(render(draft, JULY_NOW, 'edit')).toEqual({
        embeds: [
          {
            title: 'Edit schedule: DSR prog night',
            description: [
              'Sat at 8:00 PM Pacific.',
              'The next event starts <t:1784430000:F> and is posted <t:1784426400:R>.',
              'Sign-ups close when it starts.',
            ].join('\n'),
            fields: [
              { name: 'Encounters', value: '[FRU] Futures Rewritten' },
              { name: 'Channel', value: '<#channel-1>' },
              { name: 'Post ahead', value: '1 hour' },
            ],
          },
        ],
        components: [
          daysRow(['sat']),
          zoneRow(SUMMER_LABELS, USTimeZones.PACIFIC),
          buttonRow(false),
        ],
      });
    });
  });

  describe('when the panel is opened in July', () => {
    it('labels the zones with their daylight-saving offsets', () => {
      expect(render(aDraft(), JULY_NOW, 'create').components[1]).toEqual(
        zoneRow(SUMMER_LABELS, USTimeZones.EASTERN),
      );
    });
  });

  describe('when the panel is opened in January', () => {
    it('labels the zones with their standard offsets', () => {
      expect(render(aDraft(), JANUARY_NOW, 'create').components[1]).toEqual(
        zoneRow(
          [
            'Eastern (UTC−5)',
            'Central (UTC−6)',
            'Mountain (UTC−7)',
            'Pacific (UTC−8)',
          ],
          USTimeZones.EASTERN,
        ),
      );
    });
  });
});

describe('describeRecurrence', () => {
  describe('when days are given out of order', () => {
    it('lists them Monday to Sunday', () => {
      expect(
        describeRecurrence({
          weekdays: ['sun', 'wed', 'mon'],
          startTime: '20:00',
          timeZone: USTimeZones.CENTRAL,
        }),
      ).toBe('Mon, Wed, Sun at 8:00 PM Central');
    });
  });

  describe.each([
    ['00:30', '12:30 AM'],
    ['09:05', '9:05 AM'],
    ['12:00', '12:00 PM'],
    ['23:45', '11:45 PM'],
  ])('when it starts at %s', (startTime, shown) => {
    it(`shows ${shown}`, () => {
      expect(
        describeRecurrence({
          weekdays: ['fri'],
          startTime,
          timeZone: USTimeZones.MOUNTAIN,
        }),
      ).toBe(`Fri at ${shown} Mountain`);
    });
  });
});
