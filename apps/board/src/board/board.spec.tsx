// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@solidjs/testing-library';
import type { BoardEvent } from '@ulti-project/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatStart } from '../format';
import { json } from '../test-utils/api-stub';
import { type FakeEventSource } from '../test-utils/fake-event-source';
import {
  boardEvent,
  FROGE,
  meResponse,
  participant,
  SPACE,
} from '../test-utils/fixtures';
import { claimBy, GET_ME, openBoard } from '../test-utils/open-board';

const aeryn = participant({
  discordId: 'p1',
  character: 'Aeryn Vail',
  displayName: 'Aeryn',
  job: 'PLD',
  jobRole: 'tank',
  claim: claimBy(FROGE.id),
});
const cass = participant({
  discordId: 'p2',
  character: 'Cass Ember',
  job: 'WHM',
  jobRole: 'healer',
});
const bricktop = participant({
  discordId: 'p3',
  character: 'Bricktop',
  job: 'WAR',
  jobRole: 'tank',
  phase: { label: 'P3: Apocalypse', order: 30, bucket: 'prog' },
  claim: claimBy(SPACE.id),
});
const dax = participant({
  discordId: 'p4',
  character: 'Dax Rook',
  job: 'SAM',
  jobRole: 'dps',
  phase: { label: 'P5: Enrage', order: 55, bucket: 'clear' },
  claim: claimBy(FROGE.id),
});
const echo = participant({
  discordId: 'p5',
  character: 'Echo Lark',
  job: 'DRG',
  jobRole: 'dps',
  phase: { label: 'P5: Fulgent Blade 1', order: 50, bucket: 'clear' },
});
const fen = participant({
  discordId: 'p6',
  character: 'Fen Marsh',
  encounter: 'TOP',
  job: 'BLM',
  jobRole: 'dps',
  phase: { label: 'P3: Hello World', order: 30, bucket: 'prog' },
});

const EVENT: BoardEvent = Object.freeze(
  boardEvent({
    encounters: [
      {
        id: 'FRU',
        name: 'Futures Rewritten',
        progPartyThreshold: 'P3: Apocalypse',
        clearPartyThreshold: 'P5: Fulgent Blade 1',
      },
      { id: 'TOP', name: 'The Omega Protocol' },
    ],
    // Out of board order on purpose: the table sorts.
    participants: [bricktop, cass, fen, echo, aeryn, dax],
  }),
);

const signedIn = () => json(200, meResponse({ kind: 'viewer' }));

const AERYN_ROW = ['Aeryn Vail PLD', 'P4: Enrage', 'FRG'];
const CASS_ROW = ['Cass Ember WHM', 'P4: Enrage', ''];
const BRICKTOP_ROW = ['Bricktop WAR', 'P3: Apocalypse', 'SPC'];
const DAX_ROW = ['Dax Rook SAM', 'P5: Enrage', 'FRG'];
const ECHO_ROW = ['Echo Lark DRG', 'P5: Fulgent Blade 1', ''];

beforeEach(() => {
  // jsdom has no matchMedia; this is a browser whose system theme is light.
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

async function openLiveBoard(
  url = '/events/event-1?enc=FRU',
  event: BoardEvent = EVENT,
): Promise<FakeEventSource> {
  const { source } = await openBoard({ url, event });
  return source;
}

/** A cell's text as read aloud: decorative (aria-hidden) parts left out. */
function spokenText(cell: Element): string {
  const copy = cell.cloneNode(true);
  if (!(copy instanceof Element)) return '';
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]'))
    hidden.remove();
  return copy.textContent ?? '';
}

function bodyRows(caption: string): Element[] {
  return Array.from(
    screen.getByRole('table', { name: caption }).querySelectorAll('tbody tr'),
  );
}

function rowsOf(caption: string): string[][] {
  return bodyRows(caption).map((row) =>
    Array.from(row.querySelectorAll('th, td'), spokenText),
  );
}

const PROG = 'Futures Rewritten Prog party';
const CLEAR = 'Futures Rewritten Clear party';

/** A party's header, piece by piece: title, count, claimed tally, threshold. */
function partyHeader(title: string): string[] {
  const header = screen
    .getByRole('region', { name: title })
    .querySelector('header');
  return Array.from(header?.children ?? [], (piece) => piece.textContent ?? '');
}

function show(label: string): void {
  const option = screen.getByRole('option', { name: label });
  fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
    target: { value: option.getAttribute('value') },
  });
}

describe("an encounter's players", () => {
  it('are split into the Prog and Clear parties in board order, leaving out other encounters', async () => {
    await openLiveBoard();

    expect(rowsOf(PROG)).toEqual([AERYN_ROW, CASS_ROW, BRICKTOP_ROW]);
    expect(rowsOf(CLEAR)).toEqual([DAX_ROW, ECHO_ROW]);
    expect(
      within(screen.getByRole('tabpanel')).getByText('5 signed up'),
    ).toBeTruthy();
  });

  it('dim a repeated phase label and mark where each phase starts', async () => {
    await openLiveBoard();
    const rows = bodyRows(PROG);

    expect(
      rows.map((row) => [
        row.classList.contains('is-phase-start'),
        row.children[1]?.firstElementChild?.classList.contains('is-repeat'),
      ]),
    ).toEqual([
      [true, false],
      [false, true],
      [true, false],
    ]);
  });
});

describe('the party headers', () => {
  it('show the count, the claimed tally and the threshold the party starts from', async () => {
    await openLiveBoard();

    expect(partyHeader('Prog Party')).toEqual([
      'Prog Party',
      '3',
      '· 2 claimed',
      'from P3: Apocalypse',
    ]);
  });

  it('show no threshold when the encounter has none, and an empty party says so', async () => {
    await openLiveBoard('/events/event-1?enc=TOP');

    expect(partyHeader('Prog Party')).toEqual([
      'Prog Party',
      '1',
      '· 0 claimed',
    ]);
    expect(
      within(screen.getByRole('region', { name: 'Clear Party' })).getByText(
        'No players yet.',
      ),
    ).toBeTruthy();
  });
});

describe('the encounter tabs', () => {
  const panelHeading = () =>
    within(screen.getByRole('tabpanel')).getByRole('heading', { level: 2 })
      .textContent;

  it('show the encounter named in the URL, and a click switches the URL to another', async () => {
    await openLiveBoard('/events/event-1?enc=TOP');

    expect(panelHeading()).toBe('The Omega Protocol');
    expect(
      within(screen.getByRole('tabpanel')).getByText('1 signed up'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'FRU' }));

    await waitFor(() => expect(panelHeading()).toBe('Futures Rewritten'));
    expect(new URLSearchParams(location.search).get('enc')).toBe('FRU');
  });

  it('move with the arrow keys, wrapping from the last tab to the first', async () => {
    await openLiveBoard('/events/event-1?enc=TOP');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'TOP' }), {
      key: 'ArrowRight',
    });

    await waitFor(() => expect(panelHeading()).toBe('Futures Rewritten'));
    const first = screen.getByRole('tab', { name: 'FRU' });
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(first);
  });

  it("select the first encounter when the URL names one the event doesn't have", async () => {
    await openLiveBoard('/events/event-1?enc=UWU');

    expect(
      screen.getByRole('tab', { name: 'FRU' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(panelHeading()).toBe('Futures Rewritten');
  });

  it('fall back to the first encounter when a fresh snapshot removes the selected one', async () => {
    const source = await openLiveBoard('/events/event-1?enc=TOP');

    source.send({
      type: 'snapshot',
      event: { ...EVENT, encounters: EVENT.encounters.slice(0, 1) },
    });

    await waitFor(() => expect(panelHeading()).toBe('Futures Rewritten'));
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'FRU',
    ]);
  });
});

describe('the Show filter', () => {
  it("narrows both parties to one squad's claims or the unclaimed, leaving the tallies alone", async () => {
    const source = await openLiveBoard();

    show('Froge Army only');
    expect([rowsOf(PROG), rowsOf(CLEAR)]).toEqual([[AERYN_ROW], [DAX_ROW]]);
    expect(partyHeader('Prog Party')).toEqual([
      'Prog Party',
      '3',
      '· 2 claimed',
      'from P3: Apocalypse',
    ]);

    show('Unclaimed only');
    expect([rowsOf(PROG), rowsOf(CLEAR)]).toEqual([[CASS_ROW], [ECHO_ROW]]);

    // Another squad's claim lands while the filter is on.
    source.send({
      type: 'participant-upserted',
      participant: { ...cass, claim: claimBy(SPACE.id) },
    });
    await waitFor(() => expect(rowsOf(PROG)).toEqual([]));
  });

  it('keeps its squad across a fresh snapshot, and goes back to All players once that squad is gone', async () => {
    const source = await openLiveBoard();
    const select = screen.getByRole('combobox', { name: 'Show' });
    if (!(select instanceof HTMLSelectElement))
      throw new Error('Show is not a select');
    show('Froge Army only');

    source.send({ type: 'snapshot', event: structuredClone(EVENT) });
    await waitFor(() =>
      expect(select.selectedOptions[0]?.textContent).toBe('Froge Army only'),
    );
    expect(rowsOf(PROG)).toEqual([AERYN_ROW]);

    source.send({ type: 'snapshot', event: { ...EVENT, squads: [SPACE] } });
    await waitFor(() =>
      expect(select.selectedOptions[0]?.textContent).toBe('All players'),
    );
    // Aeryn's claim is still Froge's, but with Froge gone it has no token.
    expect(rowsOf(PROG)).toEqual([
      ['Aeryn Vail PLD', 'P4: Enrage', ''],
      CASS_ROW,
      BRICKTOP_ROW,
    ]);
  });
});

describe('the claim indicator', () => {
  it('switches to tokens only, and is remembered next time', async () => {
    await openLiveBoard();
    expect(screen.getByRole('main').dataset.claimStyle).toBe('rich');

    fireEvent.click(screen.getByRole('button', { name: 'Token only' }));
    expect(screen.getByRole('main').dataset.claimStyle).toBe('min');

    cleanup();
    await openLiveBoard();
    expect(screen.getByRole('main').dataset.claimStyle).toBe('min');
    expect(
      screen
        .getByRole('button', { name: 'Token only' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

describe('grouping by squad', () => {
  it("splits a party into each squad's section, then the unclaimed, and is remembered next time", async () => {
    await openLiveBoard();

    fireEvent.click(screen.getByRole('button', { name: 'By squad' }));

    expect(rowsOf(PROG)).toEqual([
      ['Froge Army · 1'],
      AERYN_ROW,
      ['Space Travelers · 1'],
      BRICKTOP_ROW,
      ['Unclaimed · 1'],
      CASS_ROW,
    ]);
    // Each section's first row starts a phase, even Cass's, which repeats Aeryn's label overall.
    const playerRows = bodyRows(PROG).filter((row) => row.querySelector('td'));
    expect(
      playerRows.map((row) => [
        row.classList.contains('is-phase-start'),
        row.children[1]?.firstElementChild?.classList.contains('is-repeat'),
      ]),
    ).toEqual([
      [true, false],
      [true, false],
      [true, false],
    ]);

    show('Froge Army only');
    expect(rowsOf(PROG)).toEqual([['Froge Army · 1'], AERYN_ROW]);

    cleanup();
    await openLiveBoard();
    expect(rowsOf(PROG)[0]).toEqual(['Froge Army · 1']);
  });
});

describe('the board header', () => {
  it.each([
    { status: 'open', badge: [] },
    { status: 'signups-closed', badge: ['Sign-ups closed'] },
    { status: 'closed', badge: ['Closed'] },
  ] as const)(
    'shows the title, the start time and, for $status, the status badge',
    async ({ status, badge }) => {
      await openLiveBoard(undefined, { ...EVENT, status });

      const header = screen.getByRole('heading', { level: 1 }).parentElement;
      expect(
        Array.from(header?.children ?? [], (piece) => piece.textContent),
      ).toEqual(['Saturday FRU', formatStart(EVENT.startsAt), ...badge]);
    },
  );
});

describe('the live stream', () => {
  it('shows Live after the snapshot and Reconnecting… when dropped, and leaving the board closes it', async () => {
    const { source } = await openBoard({
      url: '/events/event-1?enc=FRU',
      routes: {
        'GET /api/events': json(200, []),
      },
    });
    source.send({ type: 'snapshot', event: EVENT });
    expect(await screen.findByText('Live')).toBeTruthy();

    source.drop();
    expect(await screen.findByText('Reconnecting…')).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: /ULTI PROJECT/ }));

    await screen.findByRole('heading', { name: 'Open events' });
    expect(source.closed).toBe(true);
    expect(screen.queryByText('Reconnecting…')).toBeNull();
  });
});

describe('a board that is refused', () => {
  it("says the event doesn't exist when it's gone, with a way back", async () => {
    const { source } = await openBoard({
      url: '/events/event-1',
      routes: {
        'GET /api/events/event-1': json(404, { reason: 'not-found' }),
      },
    });

    source.refuse();

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      "This event doesn't exist or was removed",
    );
    expect(
      screen.getByRole('link', { name: 'Back to events' }).getAttribute('href'),
    ).toBe('/');
  });

  it("says the board can't be viewed, with a way back, when the event is refused but the user still has access", async () => {
    const { source } = await openBoard({
      url: '/events/event-1',
      routes: {
        'GET /api/events/event-1': json(403, { reason: 'no-role' }),
      },
    });

    source.refuse();

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      "You can't view this board right now.",
    );
    expect(
      screen.getByRole('link', { name: 'Back to events' }).getAttribute('href'),
    ).toBe('/');
  });

  it('asks who is signed in again when access is revoked, and shows the no-access screen', async () => {
    let me = signedIn;
    const { source, sent } = await openBoard({
      url: '/events/event-1',
      routes: {
        'GET /api/me': () => me(),
        'GET /api/events/event-1': json(403, { reason: 'no-role' }),
      },
    });
    source.send({ type: 'snapshot', event: EVENT });
    await screen.findByRole('tabpanel');

    me = () => json(403, { reason: 'no-role' });
    source.refuse();

    await screen.findByRole('heading', { name: "You don't have access" });
    expect(sent).toEqual([
      GET_ME,
      { ...GET_ME, path: '/api/events/event-1' },
      GET_ME,
    ]);
  });
});
