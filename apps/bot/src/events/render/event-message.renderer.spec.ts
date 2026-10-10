import {
  Encounter,
  EncounterFriendlyDescription,
  Job,
} from '@ulti-project/shared';
import { type APIEmbed, embedLength } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  EventStatus,
  type ParticipantDocument,
  type StoredEvent,
} from '../../firebase/models/event.model.js';
import { eventButtonRow } from '../../test-utils/events.js';
import {
  type EventMessageInput,
  jobBadge,
  renderEventMessage,
} from './event-message.renderer.js';

const STARTS_AT = Timestamp.fromDate(new Date('2026-10-10T20:00:00Z')); // 1791662400
const CUTOFF = Timestamp.fromDate(new Date('2026-10-10T18:00:00Z')); // 1791655200
const NOW = new Date('2026-10-09T12:00:00Z');
const WAR_EMOJI = '111111111111111111';

const P6 = Object.freeze({
  roleId: 'role-p6',
  label: 'P6',
  order: 6,
  bucket: 'prog',
} as const);
const P3 = Object.freeze({
  roleId: 'role-p3',
  label: 'P3',
  order: 3,
  bucket: 'prog',
} as const);
const CLEARED = Object.freeze({
  roleId: 'role-clear',
  label: 'Cleared',
  order: 8,
  bucket: 'clear',
} as const);

const OPEN_DESCRIPTION = [
  '<t:1791662400:F> (<t:1791662400:R>)',
  'Sign-ups close <t:1791655200:R>',
  'Organized by <@organizer-1>',
].join('\n');

function anEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: 'event-1',
    guildId: 'guild-1',
    title: 'DSR prog night',
    startsAt: STARTS_AT,
    signupsCloseAt: CUTOFF,
    signupsCloseDueAt: CUTOFF,
    encounters: [Encounter.DSR, Encounter.TOP],
    channelId: 'channel-1',
    messageId: 'message-1',
    createdBy: 'organizer-1',
    status: EventStatus.Open,
    ...overrides,
  };
}

/** A participant who picked their job with the Sign up button. */
type PickedParticipant = Extract<ParticipantDocument, { job: Job }>;

/** Sign-up times count up in minutes from this, so `minute` orders them. */
function aParticipant(
  minute: number,
  overrides: Partial<PickedParticipant> = {},
): ParticipantDocument {
  return {
    discordId: `player-${minute}`,
    encounter: Encounter.DSR,
    job: Job.WAR,
    character: `character ${minute}`,
    world: 'jenova',
    phase: P6,
    signedUpAt: Timestamp.fromDate(new Date(Date.UTC(2026, 9, 8, 12, minute))),
    ...overrides,
  };
}

function render(overrides: Partial<EventMessageInput> = {}): APIEmbed[] {
  const { embeds } = renderEventMessage({
    event: anEvent(),
    participants: [],
    jobEmojis: {},
    encounterNames: EncounterFriendlyDescription,
    now: NOW,
    ...overrides,
  });
  return embeds.map((embed) => embed.toJSON());
}

/** The message's components for `event` at `now`, as Discord receives them. */
function renderComponents(event: StoredEvent, now: Date) {
  const { components } = renderEventMessage({
    event,
    participants: [],
    jobEmojis: {},
    encounterNames: EncounterFriendlyDescription,
    now,
  });
  return components.map((row) => row.toJSON());
}

/** 18-digit ids, as real Discord users have. */
function manyParticipants(
  count: number,
  phase: (index: number) => ParticipantDocument['phase'],
): ParticipantDocument[] {
  return Array.from({ length: count }, (_, index) =>
    aParticipant(index, {
      discordId: `${'1'.repeat(15)}${String(index).padStart(3, '0')}`,
      character: `character ${String(index).padStart(3, '0')}`,
      world: 'cuchulainn',
      phase: phase(index),
    }),
  );
}

describe('when an event has sign-ups for one encounter and none for another', () => {
  it('lists the sign-ups under the first and says the second has none', () => {
    expect(
      render({
        participants: [
          aParticipant(0),
          aParticipant(1, { job: Job.SCH, world: 'cactuar' }),
        ],
      }),
    ).toEqual([
      {
        title: 'DSR prog night',
        description: OPEN_DESCRIPTION,
        fields: [
          { name: '__[DSR] Dragonsong Reprise__', value: '2 signed up' },
          {
            name: 'P6 (2)',
            value: [
              '`WAR` <@player-0> Character 0@Jenova',
              '`SCH` <@player-1> Character 1@Cactuar',
            ].join('\n'),
          },
          { name: '__[TOP] The Omega Protocol__', value: 'No sign-ups yet' },
        ],
      },
    ]);
  });
});

describe('when sign-ups span phases and roles', () => {
  it('lists the furthest phase first, then tanks, healers and dps by sign-up time', () => {
    expect(
      render({
        event: anEvent({ encounters: [Encounter.DSR] }),
        participants: [
          aParticipant(0, { job: Job.MNK }),
          aParticipant(1, { job: Job.WHM }),
          aParticipant(2, { job: Job.DRK }),
          aParticipant(3, { job: Job.PLD }),
          aParticipant(4, { job: Job.BRD, phase: P3 }),
          aParticipant(5, { job: Job.SGE, phase: CLEARED }),
        ],
      }),
    ).toEqual([
      {
        title: 'DSR prog night',
        description: OPEN_DESCRIPTION,
        fields: [
          { name: '__[DSR] Dragonsong Reprise__', value: '6 signed up' },
          {
            name: 'Cleared (1)',
            value: '`SGE` <@player-5> Character 5@Jenova',
          },
          {
            name: 'P6 (4)',
            value: [
              '`DRK` <@player-2> Character 2@Jenova',
              '`PLD` <@player-3> Character 3@Jenova',
              '`WHM` <@player-1> Character 1@Jenova',
              '`MNK` <@player-0> Character 0@Jenova',
            ].join('\n'),
          },
          { name: 'P3 (1)', value: '`BRD` <@player-4> Character 4@Jenova' },
        ],
      },
    ]);
  });
});

describe('when a job has an emoji set', () => {
  it('shows the emoji for that job and the abbreviation for the others', () => {
    expect(
      render({
        event: anEvent({ encounters: [Encounter.DSR] }),
        participants: [aParticipant(0), aParticipant(1, { job: Job.SCH })],
        jobEmojis: { [Job.WAR]: WAR_EMOJI },
      }),
    ).toEqual([
      {
        title: 'DSR prog night',
        description: OPEN_DESCRIPTION,
        fields: [
          { name: '__[DSR] Dragonsong Reprise__', value: '2 signed up' },
          {
            name: 'P6 (2)',
            value: [
              `<:WAR:${WAR_EMOJI}> <@player-0> Character 0@Jenova`,
              '`SCH` <@player-1> Character 1@Jenova',
            ].join('\n'),
          },
        ],
      },
    ]);
  });
});

describe('jobBadge', () => {
  it('is the emoji when the job has one, else the abbreviation', () => {
    expect([
      jobBadge(Job.WAR, { [Job.WAR]: WAR_EMOJI }),
      jobBadge(Job.SCH, { [Job.WAR]: WAR_EMOJI }),
    ]).toEqual([`<:WAR:${WAR_EMOJI}>`, '`SCH`']);
  });
});

describe('when an event changes status', () => {
  const descriptionFor = (event: StoredEvent) =>
    render({ event: anEvent({ ...event, encounters: [Encounter.DSR] }) }).map(
      (embed) => embed.description,
    );

  it('says sign-ups are closed once they close', () => {
    expect(
      descriptionFor(anEvent({ status: EventStatus.SignupsClosed })),
    ).toEqual([
      [
        '<t:1791662400:F> (<t:1791662400:R>)',
        'Sign-ups closed',
        'Organized by <@organizer-1>',
      ].join('\n'),
    ]);
  });

  it('says the event is closed once it closes', () => {
    expect(descriptionFor(anEvent({ status: EventStatus.Closed }))).toEqual([
      [
        '<t:1791662400:F> (<t:1791662400:R>)',
        'Closed',
        'Organized by <@organizer-1>',
      ].join('\n'),
    ]);
  });

  it('leaves out the sign-up close time when sign-ups close at the start', () => {
    expect(descriptionFor(anEvent({ signupsCloseAt: STARTS_AT }))).toEqual([
      [
        '<t:1791662400:F> (<t:1791662400:R>)',
        'Organized by <@organizer-1>',
      ].join('\n'),
    ]);
  });
});

describe('when one phase has more sign-ups than a field holds', () => {
  it('continues the phase in further fields of at most 1024 characters', () => {
    const [embed] = render({
      event: anEvent({ encounters: [Encounter.DSR] }),
      participants: manyParticipants(40, () => P6),
      jobEmojis: { [Job.WAR]: WAR_EMOJI },
    });

    expect(
      embed?.fields?.map(({ name, value }) => [
        name,
        value.length,
        value.split('\n').length,
      ]),
    ).toEqual([
      ['__[DSR] Dragonsong Reprise__', 12, 1],
      ['P6 (40)', 1021, 14],
      ['P6 (cont.)', 1021, 14],
      ['P6 (cont.)', 875, 12],
    ]);
  });
});

/** Discord caps a message's embeds at 6000 characters between them. */
function messageSize(embeds: readonly APIEmbed[]): number {
  return embeds.reduce((total, embed) => total + embedLength(embed), 0);
}

describe('when sign-ups outgrow the message’s 6000 characters', () => {
  const render100 = () =>
    render({
      event: anEvent({ encounters: [Encounter.DSR] }),
      participants: manyParticipants(100, () => P6),
      jobEmojis: { [Job.WAR]: WAR_EMOJI },
    });

  it('stops within the limit and says how many it left out', () => {
    const embeds = render100();

    expect(messageSize(embeds)).toBeLessThanOrEqual(6000);
    expect(
      embeds.map((embed) => ({
        title: embed.title,
        fields: embed.fields?.map(({ name, value }) => [name, value.length]),
        size: embedLength(embed),
      })),
    ).toEqual([
      {
        title: 'DSR prog night',
        fields: [
          ['__[DSR] Dragonsong Reprise__', 13],
          ['P6 (100)', 1021],
          ['P6 (cont.)', 1021],
          ['P6 (cont.)', 1021],
          ['P6 (cont.)', 1021],
          ['\u200b', 28],
        ],
        size: 4301,
      },
    ]);
    expect(embeds[0]?.fields?.at(-1)?.value).toEqual(
      '…and 44 more. See the board.',
    );
  });
});

describe('when sign-ups need more than 25 fields', () => {
  // one phase each, so every sign-up takes a field of its own
  const render300 = () =>
    render({
      event: anEvent({ encounters: [Encounter.DSR] }),
      participants: manyParticipants(300, (index) => ({
        roleId: `role-${index}`,
        label: `Phase ${String(index).padStart(3, '0')}`,
        order: 1000 - index,
        bucket: 'prog',
      })),
      jobEmojis: { [Job.WAR]: WAR_EMOJI },
    });

  it('spreads them over embeds of 25 fields within the message’s 6000 characters', () => {
    const embeds = render300();

    expect(messageSize(embeds)).toBeLessThanOrEqual(6000);
    expect(
      embeds.map((embed) => ({
        fields: embed.fields?.length,
        size: embedLength(embed),
        titled: embed.title !== undefined,
      })),
    ).toEqual([
      { fields: 25, size: 2190, titled: true },
      { fields: 25, size: 2125, titled: false },
      { fields: 19, size: 1560, titled: false },
    ]);
  });

  it('ends with how many sign-ups it left out', () => {
    const fields = render300().flatMap((embed) => embed.fields ?? []);

    expect(fields.slice(-2)).toEqual([
      {
        name: 'Phase 066 (1)',
        value: `<:WAR:${WAR_EMOJI}> <@111111111111111066> Character 066@Cuchulainn`,
      },
      { name: '\u200b', value: '…and 233 more. See the board.' },
    ]);
  });
});

describe('the buttons on an event message', () => {
  const BEFORE_CUTOFF = new Date(CUTOFF.toMillis() - 1);
  const AT_CUTOFF = CUTOFF.toDate();

  it.each([
    {
      scenario: 'an open event before sign-ups close',
      result: 'enables Sign up',
      event: anEvent(),
      now: BEFORE_CUTOFF,
      enabled: { signup: true },
    },
    {
      scenario: 'an open event whose sign-up time has passed',
      result: 'disables Sign up',
      event: anEvent(),
      now: AT_CUTOFF,
      enabled: { signup: false },
    },
    {
      scenario: 'an event with sign-ups closed',
      result: 'disables Sign up',
      event: anEvent({ status: EventStatus.SignupsClosed }),
      now: BEFORE_CUTOFF,
      enabled: { signup: false },
    },
  ])('for $scenario, $result', ({ event, now, enabled }) => {
    expect(renderComponents(event, now)).toEqual([
      eventButtonRow(event.id, enabled),
    ]);
  });

  it('shows none on a closed event', () => {
    expect(
      renderComponents(anEvent({ status: EventStatus.Closed }), BEFORE_CUTOFF),
    ).toEqual([]);
  });
});
