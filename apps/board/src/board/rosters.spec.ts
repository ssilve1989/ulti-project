// @vitest-environment jsdom
import type {
  BoardEvent,
  BoardRoster,
  RosterTeam,
  SquadHelper,
} from '@ulti-project/shared';
import { createComponent, createRoot } from 'solid-js';
import { describe, expect, it, onTestFinished } from 'vitest';
import { ShellContext } from '../shell/shell-context';
import { json, stubApi } from '../test-utils/api-stub';
import { installFakeEventSource } from '../test-utils/fake-event-source';
import {
  boardEvent,
  FROGE,
  meResponse,
  participant,
} from '../test-utils/fixtures';
import { createEventStream, type EventStream } from './event-stream';
import {
  createRosterActions,
  type RosterActions,
  slotOptions,
} from './rosters';

const aeryn = participant({
  discordId: '111111111111111111',
  character: 'Aeryn Vail',
  job: 'WHM',
});
const bricktop = participant({
  discordId: '222222222222222222',
  character: 'Bricktop',
  job: 'MNK',
});
const CASS: SquadHelper = {
  discordId: '333333333333333333',
  displayName: 'Cass',
};
const DAX: SquadHelper = {
  discordId: '444444444444444444',
  displayName: 'Dax',
};

const froge = (teams: BoardRoster['teams']): BoardRoster => ({
  encounter: 'FRU',
  squadId: FROGE.id,
  teams,
});
const TEAM_B: RosterTeam = {
  id: 'team-b',
  slots: {
    melee: {
      kind: 'progger',
      participantId: bricktop.id,
      discordId: bricktop.discordId,
    },
  },
};
const ROSTER = froge([
  { id: 'team-a', slots: { 'tank-1': { kind: 'helper', ...DAX } } },
  TEAM_B,
]);

describe('the options for a slot', () => {
  const claimed = [aeryn, bricktop];
  const helpers = [CASS, DAX];
  const otherProggers = [
    { value: `progger:${aeryn.id}`, label: 'Aeryn Vail' },
    { value: `progger:${bricktop.id}`, label: 'Bricktop (Team 2 · Melee)' },
  ];
  const helperOptions = [
    { value: `helper:${CASS.discordId}`, label: 'Cass' },
    { value: `helper:${DAX.discordId}`, label: 'Dax (Team 1 · Tank)' },
  ];

  it('suggests the claimed proggers whose job fits the slot, and labels placed people with their team and slot', () => {
    expect(slotOptions('regen-healer', claimed, helpers, ROSTER)).toEqual({
      suggested: [{ value: `progger:${aeryn.id}`, label: 'Aeryn Vail' }],
      otherProggers: [
        { value: `progger:${bricktop.id}`, label: 'Bricktop (Team 2 · Melee)' },
      ],
      helpers: helperOptions,
    });
  });

  it('suggests no one whose job does not fit', () => {
    expect(slotOptions('caster', claimed, helpers, ROSTER)).toEqual({
      suggested: [],
      otherProggers,
      helpers: helperOptions,
    });
  });
});

/** A live stream of `event` and the roster actions on it, as a Froge lead. */
function openBoard(event: BoardEvent): {
  stream: EventStream;
  actions: RosterActions;
} {
  const sources = installFakeEventSource();
  const { stream, actions, dispose } = createRoot((dispose) => {
    const stream = createEventStream('event-1');
    let actions: RosterActions | undefined;
    createComponent(ShellContext.Provider, {
      value: {
        me: meResponse({ kind: 'squad', squad: FROGE }),
        refetchMe: () => {},
        setLiveStatus: () => {},
      },
      get children() {
        actions = createRosterActions('event-1', stream);
        return undefined;
      },
    });
    if (actions === undefined) throw new Error('The shell rendered nothing');
    return { stream, actions, dispose };
  });
  onTestFinished(dispose);
  const [source] = sources;
  if (source === undefined) throw new Error('No EventSource was opened');
  source.open();
  source.send({ type: 'snapshot', event });
  return { stream, actions };
}

const rosters = (stream: EventStream) => {
  const state = stream.state();
  return state.kind === 'live' ? state.event.rosters : undefined;
};

const SLOT_PATH =
  '/api/events/event-1/rosters/FRU/teams/team-a/slots/regen-healer';

describe('when a lead fills a slot', () => {
  it('is pending until the API answers, then shows the roster it answered', async () => {
    const answered = froge([
      {
        id: 'team-a',
        slots: {
          'tank-1': { kind: 'helper', ...DAX },
          'regen-healer': {
            kind: 'progger',
            participantId: aeryn.id,
            discordId: aeryn.discordId,
          },
        },
      },
      TEAM_B,
    ]);
    const { sent } = stubApi({ [`PUT ${SLOT_PATH}`]: json(200, answered) });
    const { stream, actions } = openBoard(
      boardEvent({ rosters: [ROSTER], participants: [aeryn] }),
    );

    actions.fill('FRU', 'team-a', 'regen-healer', {
      kind: 'progger',
      participantId: aeryn.id,
    });

    expect(actions.pending('team-a:regen-healer')).toBe(true);
    await expect.poll(() => rosters(stream)).toEqual([answered]);
    expect(actions.pending('team-a:regen-healer')).toBe(false);
    expect(sent).toEqual([
      {
        method: 'PUT',
        path: SLOT_PATH,
        body: JSON.stringify({ kind: 'progger', participantId: aeryn.id }),
        contentType: 'application/json',
      },
    ]);
  });

  it('empties the slot with a DELETE when nobody is chosen', async () => {
    const answered = froge([{ id: 'team-a', slots: {} }, TEAM_B]);
    const tankPath =
      '/api/events/event-1/rosters/FRU/teams/team-a/slots/tank-1';
    stubApi({ [`DELETE ${tankPath}`]: json(200, answered) });
    const { stream, actions } = openBoard(boardEvent({ rosters: [ROSTER] }));

    actions.fill('FRU', 'team-a', 'tank-1', null);

    await expect.poll(() => rosters(stream)).toEqual([answered]);
  });

  it("shows a refused helper's name on the card and keeps the roster", async () => {
    stubApi({
      [`PUT ${SLOT_PATH}`]: json(403, { reason: 'not-a-helper' }),
    });
    const { stream, actions } = openBoard(boardEvent({ rosters: [ROSTER] }));

    actions.fill('FRU', 'team-a', 'regen-healer', {
      kind: 'helper',
      discordId: CASS.discordId,
      displayName: CASS.displayName,
    });

    await expect
      .poll(() => actions.error('team-a'))
      .toBe("Cass doesn't have the squad role.");
    expect(rosters(stream)).toEqual([ROSTER]);
  });
});
