// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@solidjs/testing-library';
import type {
  BoardEvent,
  BoardParticipant,
  BoardRoster,
  RosterTeam,
  SlotFill,
  SquadHelper,
} from '@ulti-project/shared';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { json, stubApi } from '../test-utils/api-stub';
import { boardEvent, FROGE, participant, SPACE } from '../test-utils/fixtures';
import {
  claimBy,
  GET_HELPERS,
  GET_ME,
  held,
  openBoard,
} from '../test-utils/open-board';

const aeryn = participant({
  discordId: 'p1',
  character: 'Aeryn Vail',
  claim: claimBy(FROGE.id),
});
const cass = participant({
  discordId: 'p2',
  character: 'Cass Ember',
  job: 'WHM',
  claim: claimBy(FROGE.id),
});
const dax = participant({
  discordId: 'p4',
  character: 'Dax Rook',
  job: 'SAM',
  claim: claimBy(FROGE.id),
});
// Space's claim: never offered to Froge.
const bricktop = participant({
  discordId: 'p3',
  character: 'Bricktop',
  job: 'WAR',
  claim: claimBy(SPACE.id),
});
const HANA: SquadHelper = Object.freeze({
  discordId: 'h1',
  displayName: 'Hana',
});

const progger = (p: BoardParticipant): SlotFill => ({
  kind: 'progger',
  participantId: p.id,
  discordId: p.discordId,
});
const helper = (h: SquadHelper): SlotFill => ({ kind: 'helper', ...h });
const roster = (teams: RosterTeam[]): BoardRoster => ({
  encounter: 'FRU',
  squadId: FROGE.id,
  teams,
});
const withTeams = (...teams: RosterTeam[]): BoardEvent =>
  boardEvent({
    participants: [aeryn, cass, dax, bricktop],
    rosters: [roster(teams)],
  });

const ROSTERS = '/api/events/event-1/rosters/FRU';
const EMPTY_ROWS = Object.freeze([
  ['Tank', '—'],
  ['Tank', '—'],
  ['Regen healer', '—'],
  ['Shield healer', '—'],
  ['DPS', '—'],
  ['Melee', '—'],
  ['Ranged', '—'],
  ['Caster', '—'],
]);
/** EMPTY_ROWS with the rows at `index` replaced. */
const rowsWith = (filled: Record<number, string[]>) =>
  EMPTY_ROWS.map((row, index) => filled[index] ?? row);

beforeEach(() => {
  // jsdom has no matchMedia; this is a browser whose system theme is light.
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

/** Opens event-1's FRU board as a Froge member whose squad has Hana as a helper, after its snapshot. */
const openFrogeBoard = (
  event: BoardEvent,
  routes: Parameters<typeof stubApi>[0] = {},
) =>
  openBoard({
    access: { kind: 'squad', squad: FROGE },
    event,
    routes: { 'GET /api/squads/mine/helpers': json(200, [HANA]), ...routes },
  });

const card = (team: number) =>
  screen.getByRole('article', { name: `Froge Army · Team ${team}` });

/** A card's slot rows as shown: label, then the occupant's name and tag, or "—". */
function rows(team: number): string[][] {
  return Array.from(card(team).querySelectorAll('li'), (row) =>
    Array.from(
      row.querySelectorAll('.slot-label, .slot-name, .slot-tag'),
      (part) => part.textContent ?? '',
    ),
  );
}

/** A picker's options: each group as [label, options], then the loose options. */
function options(select: HTMLElement): (string | [string, string[]])[] {
  return Array.from(select.children, (child) =>
    child instanceof HTMLOptGroupElement
      ? [
          child.label,
          Array.from(child.children, (option) => option.textContent ?? ''),
        ]
      : (child.textContent ?? ''),
  );
}

/** The first picker named `name` (the two Tank slots share one). */
function picker(name: string): HTMLSelectElement {
  const select = screen.getAllByRole('combobox', { name })[0];
  if (!(select instanceof HTMLSelectElement))
    throw new Error(`No picker named ${name}`);
  return select;
}

const choose = (name: string, value: string) =>
  fireEvent.change(picker(name), { target: { value } });

describe("your squad's teams", () => {
  it('adds an empty team of 8 open slots', async () => {
    const { sent } = await openFrogeBoard(withTeams(), {
      [`POST ${ROSTERS}/teams`]: json(200, roster([{ id: 't1', slots: {} }])),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add team' }));

    await waitFor(() => expect(rows(1)).toEqual(EMPTY_ROWS));
    expect(sent).toEqual([
      GET_ME,
      GET_HELPERS,
      {
        method: 'POST',
        path: `${ROSTERS}/teams`,
        body: '{}',
        contentType: 'application/json',
      },
    ]);
  });

  it('offers grouped choices, and saves a suggested progger with the slot busy until the answer', async () => {
    const answer = held();
    const { sent } = await openFrogeBoard(
      withTeams({ id: 't1', slots: { 'tank-1': progger(aeryn) } }),
      { [`PUT ${ROSTERS}/teams/t1/slots/regen-healer`]: answer.route },
    );
    const select = picker('Regen healer for Team 1');
    await waitFor(() =>
      expect(options(select)).toEqual([
        ['Suggested', ['Cass Ember']],
        ['Other claimed proggers', ['Aeryn Vail (Team 1 · Tank)', 'Dax Rook']],
        ['Helpers', ['Hana']],
        'Empty',
      ]),
    );

    choose('Regen healer for Team 1', `progger:${cass.id}`);

    // Marked disabled without `disabled`, which would drop the picker's focus.
    expect([select.getAttribute('aria-disabled'), select.disabled]).toEqual([
      'true',
      false,
    ]);
    // A second choice while it saves is ignored.
    choose('Regen healer for Team 1', `helper:${HANA.discordId}`);
    await waitFor(() =>
      expect(sent).toEqual([
        GET_ME,
        GET_HELPERS,
        {
          method: 'PUT',
          path: `${ROSTERS}/teams/t1/slots/regen-healer`,
          body: `{"kind":"progger","participantId":"${cass.id}"}`,
          contentType: 'application/json',
        },
      ]),
    );
    expect(select.value).toBe('');
    answer.answer(
      json(
        200,
        roster([
          {
            id: 't1',
            slots: { 'tank-1': progger(aeryn), 'regen-healer': progger(cass) },
          },
        ]),
      ),
    );

    await waitFor(() =>
      expect(rows(1)).toEqual(
        rowsWith({
          0: ['Tank', 'Aeryn Vail', 'progger'],
          2: ['Regen healer', 'Cass Ember', 'progger'],
        }),
      ),
    );
    expect(select.getAttribute('aria-disabled')).toBe('false');
  });

  it('moves someone placed in another team, showing them once', async () => {
    await openFrogeBoard(
      withTeams(
        { id: 't1', slots: { melee: progger(dax) } },
        { id: 't2', slots: {} },
      ),
      {
        [`PUT ${ROSTERS}/teams/t2/slots/tank-1`]: json(
          200,
          roster([
            { id: 't1', slots: {} },
            { id: 't2', slots: { 'tank-1': progger(dax) } },
          ]),
        ),
      },
    );
    const select = picker('Tank for Team 2');
    await waitFor(() =>
      expect(options(select)).toEqual([
        ['Suggested', ['Aeryn Vail']],
        ['Other claimed proggers', ['Cass Ember', 'Dax Rook (Team 1 · Melee)']],
        ['Helpers', ['Hana']],
        'Empty',
      ]),
    );

    choose('Tank for Team 2', `progger:${dax.id}`);

    await waitFor(() =>
      expect(rows(2)).toEqual(rowsWith({ 0: ['Tank', 'Dax Rook', 'progger'] })),
    );
    expect(rows(1)).toEqual(EMPTY_ROWS);
  });

  it("says so on the card when the progger isn't the squad's any more", async () => {
    await openFrogeBoard(withTeams({ id: 't1', slots: {} }), {
      [`PUT ${ROSTERS}/teams/t1/slots/regen-healer`]: json(409, {
        reason: 'not-claimed',
      }),
    });

    choose('Regen healer for Team 1', `progger:${cass.id}`);

    expect((await within(card(1)).findByRole('alert')).textContent).toBe(
      "Cass Ember isn't claimed by your squad any more.",
    );
    expect(rows(1)).toEqual(EMPTY_ROWS);
  });

  describe('copying the message', () => {
    const TEAM: RosterTeam = Object.freeze({
      id: 't1',
      slots: { 'tank-1': progger(aeryn), 'regen-healer': helper(HANA) },
    });
    const MESSAGE = [
      'Starts at <t:1791590400:F>',
      'Data Center: Aether',
      ':Tank~1: <@p1>',
      ':Tank~1:',
      ':regenhealers: <@h1>',
      ':shieldhealers:',
      ':DPS~1:',
      ':Melee~1:',
      ':Ranged:',
      ':Caster~1:',
    ].join('\n');

    function stubClipboard(writeText: (text: string) => Promise<void>) {
      const spy = vi.fn(writeText);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: spy },
        configurable: true,
      });
      onTestFinished(() => {
        Reflect.deleteProperty(navigator, 'clipboard');
      });
      return spy;
    }

    it('copies the exact message and says Copied', async () => {
      const writeText = stubClipboard(async () => {});
      await openFrogeBoard(withTeams(TEAM));

      fireEvent.click(
        within(card(1)).getByRole('button', { name: 'Copy message' }),
      );

      expect(
        (await within(card(1)).findByText('Copied')).getAttribute('role'),
      ).toBe('status');
      expect(writeText).toHaveBeenCalledExactlyOnceWith(MESSAGE);
    });

    it("says Couldn't copy. when the clipboard refuses", async () => {
      stubClipboard(() => Promise.reject(new Error('NotAllowedError')));
      await openFrogeBoard(withTeams(TEAM));

      fireEvent.click(
        within(card(1)).getByRole('button', { name: 'Copy message' }),
      );

      expect(
        (await within(card(1)).findByText("Couldn't copy.")).getAttribute(
          'role',
        ),
      ).toBe('status');
    });
  });

  it('removes only an empty team', async () => {
    const { sent } = await openFrogeBoard(
      withTeams(
        { id: 't1', slots: { 'tank-1': progger(aeryn) } },
        { id: 't2', slots: {} },
      ),
      {
        [`DELETE ${ROSTERS}/teams/t2`]: json(
          200,
          roster([{ id: 't1', slots: { 'tank-1': progger(aeryn) } }]),
        ),
      },
    );
    const filled = within(card(1)).getByRole('button', { name: 'Remove team' });
    expect([filled.hasAttribute('disabled'), filled.title]).toEqual([
      true,
      'Empty every slot to remove this team.',
    ]);

    fireEvent.click(
      within(card(2)).getByRole('button', { name: 'Remove team' }),
    );

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('heading', { level: 4 })
          .map((heading) => heading.textContent),
      ).toEqual(['Froge Army · Team 1']),
    );
    expect(sent.at(-1)).toEqual({
      method: 'DELETE',
      path: `${ROSTERS}/teams/t2`,
      body: undefined,
      contentType: null,
    });
  });

  it("keeps a filled slot's picker on its occupant while the board changes around it", async () => {
    const { source } = await openFrogeBoard(
      withTeams({ id: 't1', slots: { 'tank-1': progger(aeryn) } }),
    );
    const select = picker('Tank for Team 1');
    // The helpers arriving and a new claim both rebuild the picker's options.
    await waitFor(() =>
      expect(options(select)).toEqual([
        ['Suggested', ['Aeryn Vail (Team 1 · Tank)']],
        ['Other claimed proggers', ['Cass Ember', 'Dax Rook']],
        ['Helpers', ['Hana']],
        'Empty',
      ]),
    );
    source.send({
      type: 'participant-upserted',
      participant: participant({
        discordId: 'p7',
        character: 'Gale Orrin',
        claim: claimBy(FROGE.id),
      }),
    });
    await waitFor(() =>
      expect(options(select)).toEqual([
        ['Suggested', ['Aeryn Vail (Team 1 · Tank)', 'Gale Orrin']],
        ['Other claimed proggers', ['Cass Ember', 'Dax Rook']],
        ['Helpers', ['Hana']],
        'Empty',
      ]),
    );

    expect(select.value).toBe(`progger:${aeryn.id}`);
  });

  it('keeps focus on the picker once its change is saved', async () => {
    await openFrogeBoard(withTeams({ id: 't1', slots: {} }), {
      [`PUT ${ROSTERS}/teams/t1/slots/regen-healer`]: json(
        200,
        roster([{ id: 't1', slots: { 'regen-healer': progger(cass) } }]),
      ),
    });
    const select = picker('Regen healer for Team 1');
    select.focus();

    choose('Regen healer for Team 1', `progger:${cass.id}`);

    await waitFor(() =>
      expect(rows(1)).toEqual(
        rowsWith({ 2: ['Regen healer', 'Cass Ember', 'progger'] }),
      ),
    );
    expect(document.activeElement).toBe(select);
  });

  it('shows a change another lead made', async () => {
    const { source } = await openFrogeBoard(withTeams({ id: 't1', slots: {} }));

    source.send({
      type: 'roster-updated',
      roster: roster([{ id: 't1', slots: { caster: helper(HANA) } }]),
    });

    await waitFor(() =>
      expect(rows(1)).toEqual(rowsWith({ 7: ['Caster', 'Hana', 'helper'] })),
    );
  });
});

describe('read-only teams', () => {
  const event = (status: BoardEvent['status']) =>
    boardEvent({
      status,
      participants: [aeryn, cass, bricktop],
      rosters: [
        roster([
          {
            id: 't1',
            slots: { 'tank-1': progger(aeryn), 'regen-healer': helper(HANA) },
          },
        ]),
        {
          encounter: 'FRU',
          squadId: SPACE.id,
          teams: [{ id: 's1', slots: { 'tank-1': progger(bricktop) } }],
        },
      ],
    });
  const teams = () => screen.getByRole('region', { name: 'Teams' });
  /** Each collapsed card's summary text and whether it's open. */
  const collapsed = () =>
    Array.from(teams().querySelectorAll('details'), (details) => [
      details.querySelector('summary')?.textContent,
      details.open,
    ]);

  it("shows a viewer every squad's teams collapsed, with no pickers or buttons", async () => {
    await openBoard({ event: event('open') });

    expect(collapsed()).toEqual([
      ['Froge Army · Team 1 · 2/8', false],
      ['Space Travelers · Team 1 · 1/8', false],
    ]);
    expect(within(teams()).queryAllByRole('combobox')).toEqual([]);
    expect(within(teams()).queryAllByRole('button')).toEqual([]);
  });

  it('keeps Copy message, and only that, on your own cards once the event is closed', async () => {
    await openFrogeBoard(event('closed'));

    expect(rows(1)).toEqual(
      rowsWith({
        0: ['Tank', 'Aeryn Vail', 'progger'],
        2: ['Regen healer', 'Hana', 'helper'],
      }),
    );
    expect(collapsed()).toEqual([['Space Travelers · Team 1 · 1/8', false]]);
    expect(within(teams()).queryAllByRole('combobox')).toEqual([]);
    expect(
      within(teams())
        .queryAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Copy message']);
  });
});
