// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@solidjs/testing-library';
import type { BoardEvent } from '@ulti-project/shared';
import { describe, expect, it } from 'vitest';
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
import {
  claimBy,
  ENCOUNTER_PANEL,
  encounterPanel,
  GET_ME,
  openBoard,
} from '../test-utils/open-board';

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

const AERYN_ROW = ['Aeryn Vail PLD', 'FRG'];
const CASS_ROW = ['Cass Ember WHM', ''];
const ECHO_ROW = ['Echo Lark DRG', ''];

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

/** The shown point's header, piece by piece. */
function pointHeader(): string[] {
  const header = screen
    .getByRole('tabpanel', { name: /^(P\d|Cleared)/ })
    .querySelector('header');
  return Array.from(header?.children ?? [], (piece) => piece.textContent ?? '');
}

const pointTable = (label: string) => `Futures Rewritten ${label}`;
const railTabs = () =>
  within(screen.getByRole('tablist', { name: 'Prog points' })).getAllByRole(
    'tab',
  );
const railNames = () => railTabs().map((tab) => tab.getAttribute('aria-label'));
const selectedPoint = () =>
  railTabs()
    .find((tab) => tab.getAttribute('aria-selected') === 'true')
    ?.getAttribute('aria-label');
const pp = () => new URLSearchParams(location.search).get('pp');

function show(label: string): void {
  const option = screen.getByRole('option', { name: label });
  fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
    target: { value: option.getAttribute('value') },
  });
}

describe("an encounter's prog points", () => {
  it('are listed furthest first, and the board opens on the furthest with an unclaimed player', async () => {
    await openLiveBoard();

    expect(railNames()).toEqual([
      'P5: Enrage, 1 signed up',
      'P5: Fulgent Blade 1, 1 signed up',
      'P4: Enrage, 2 signed up',
      'P3: Apocalypse, 1 signed up',
    ]);
    expect(selectedPoint()).toBe('P5: Fulgent Blade 1, 1 signed up');
    expect(rowsOf(pointTable('P5: Fulgent Blade 1'))).toEqual([ECHO_ROW]);
    expect(pp()).toBe('50');
  });

  it("show a point's players in board order once picked, and keep it in the URL", async () => {
    await openLiveBoard();

    fireEvent.click(
      screen.getByRole('tab', { name: 'P4: Enrage, 2 signed up' }),
    );

    await waitFor(() =>
      expect(rowsOf(pointTable('P4: Enrage'))).toEqual([AERYN_ROW, CASS_ROW]),
    );
    expect(pp()).toBe('40');

    cleanup();
    await openLiveBoard('/events/event-1?enc=FRU&pp=40');
    expect(selectedPoint()).toBe('P4: Enrage, 2 signed up');
  });

  it('move with the arrow keys, wrapping from the first to the last', async () => {
    await openLiveBoard('/events/event-1?enc=FRU&pp=55');

    fireEvent.keyDown(
      screen.getByRole('tab', { name: 'P5: Enrage, 1 signed up' }),
      { key: 'ArrowUp' },
    );

    await waitFor(() =>
      expect(selectedPoint()).toBe('P3: Apocalypse, 1 signed up'),
    );
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'P3: Apocalypse, 1 signed up' }),
    );
  });

  it('keep keyboard focus on the rail when a live claim lands', async () => {
    const source = await openLiveBoard('/events/event-1?enc=FRU&pp=40');
    const tab = screen.getByRole('tab', { name: 'P4: Enrage, 2 signed up' });
    tab.focus();

    source.send({
      type: 'participant-upserted',
      participant: { ...cass, claim: claimBy(SPACE.id) },
    });

    await waitFor(() =>
      expect(rowsOf(pointTable('P4: Enrage'))).toEqual([
        AERYN_ROW,
        ['Cass Ember WHM', 'SPC'],
      ]),
    );
    expect(document.activeElement).toBe(tab);
  });

  it('open the default point when the URL names one nobody is at', async () => {
    await openLiveBoard('/events/event-1?enc=FRU&pp=99');

    expect(selectedPoint()).toBe('P5: Fulgent Blade 1, 1 signed up');
    await waitFor(() => expect(pp()).toBe('50'));
  });

  it('stay on the shown point when its last unclaimed player is claimed', async () => {
    const source = await openLiveBoard();

    source.send({
      type: 'participant-upserted',
      participant: { ...echo, claim: claimBy(SPACE.id) },
    });

    await waitFor(() =>
      expect(rowsOf(pointTable('P5: Fulgent Blade 1'))).toEqual([
        ['Echo Lark DRG', 'SPC'],
      ]),
    );
    expect(selectedPoint()).toBe('P5: Fulgent Blade 1, 1 signed up');
  });

  it('fall back to the default point when a live change empties the shown one', async () => {
    const source = await openLiveBoard('/events/event-1?enc=FRU&pp=30');

    source.send({ type: 'participant-removed', participantId: bricktop.id });

    await waitFor(() =>
      expect(selectedPoint()).toBe('P5: Fulgent Blade 1, 1 signed up'),
    );
  });

  it('say there are no players yet when nobody signed up', async () => {
    await openLiveBoard(undefined, { ...EVENT, participants: [] });

    expect(within(encounterPanel()).getByText('No players yet.')).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Prog points' })).toBeNull();
  });
});

describe("the shown point's header", () => {
  it('shows its name, count, unclaimed players and role mix', async () => {
    await openLiveBoard('/events/event-1?enc=FRU&pp=40');

    expect(pointHeader()).toEqual([
      'P4: Enrage',
      '2',
      '· 1 unclaimed',
      'Tanks 1 Healers 1 DPS 0',
    ]);
  });
});

describe('the encounter tabs', () => {
  const panelHeading = () =>
    within(encounterPanel()).getByRole('heading', { level: 2 }).textContent;

  it('show the encounter named in the URL, and a click switches the URL to another', async () => {
    await openLiveBoard('/events/event-1?enc=TOP');

    expect(panelHeading()).toBe('The Omega Protocol');
    expect(within(encounterPanel()).getByText('1 signed up')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'FRU, 5 signed up' }));

    await waitFor(() => expect(panelHeading()).toBe('Futures Rewritten'));
    // The tab switch and the default point's pin are two navigations; the URL settles after the panel.
    await waitFor(() =>
      expect([new URLSearchParams(location.search).get('enc'), pp()]).toEqual([
        'FRU',
        '50',
      ]),
    );
  });

  it('move with the arrow keys, wrapping from the last tab to the first', async () => {
    await openLiveBoard('/events/event-1?enc=TOP');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'TOP, 1 signed up' }), {
      key: 'ArrowRight',
    });

    await waitFor(() => expect(panelHeading()).toBe('Futures Rewritten'));
    const first = screen.getByRole('tab', { name: 'FRU, 5 signed up' });
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(first);
  });

  it("select the first encounter when the URL names one the event doesn't have", async () => {
    await openLiveBoard('/events/event-1?enc=UWU');

    expect(
      screen
        .getByRole('tab', { name: 'FRU, 5 signed up' })
        .getAttribute('aria-selected'),
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
    expect(
      within(screen.getByRole('tablist', { name: 'Encounters' })).getAllByRole(
        'tab',
      ),
    ).toEqual([screen.getByRole('tab', { name: 'FRU, 5 signed up' })]);
  });

  it("count each encounter's sign-ups, and a new FRU sign-up raises FRU's count only", async () => {
    const source = await openLiveBoard();
    expect(screen.getByRole('tab', { name: 'FRU, 5 signed up' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'TOP, 1 signed up' })).toBeTruthy();

    source.send({
      type: 'participant-upserted',
      participant: participant({ discordId: 'p7', character: 'Gale Thorn' }),
    });

    await screen.findByRole('tab', { name: 'FRU, 6 signed up' });
    expect(screen.getByRole('tab', { name: 'TOP, 1 signed up' })).toBeTruthy();
  });
});

describe('the Show filter', () => {
  it("narrows the shown point to one squad's claims or the unclaimed, leaving the counts alone", async () => {
    const source = await openLiveBoard('/events/event-1?enc=FRU&pp=40');
    const rail = railNames();

    show('Froge Army only');
    expect(rowsOf(pointTable('P4: Enrage'))).toEqual([AERYN_ROW]);
    expect([railNames(), pointHeader()[1]]).toEqual([rail, '2']);

    show('Unclaimed only');
    expect(rowsOf(pointTable('P4: Enrage'))).toEqual([CASS_ROW]);

    // Another squad's claim lands while the filter is on.
    source.send({
      type: 'participant-upserted',
      participant: { ...cass, claim: claimBy(SPACE.id) },
    });
    await waitFor(() => expect(rowsOf(pointTable('P4: Enrage'))).toEqual([]));
  });

  it('keeps its squad across a fresh snapshot, and goes back to All players once that squad is gone', async () => {
    const source = await openLiveBoard('/events/event-1?enc=FRU&pp=40');
    const select = screen.getByRole('combobox', { name: 'Show' });
    if (!(select instanceof HTMLSelectElement))
      throw new Error('Show is not a select');
    show('Froge Army only');

    source.send({ type: 'snapshot', event: structuredClone(EVENT) });
    await waitFor(() =>
      expect(select.selectedOptions[0]?.textContent).toBe('Froge Army only'),
    );
    expect(rowsOf(pointTable('P4: Enrage'))).toEqual([AERYN_ROW]);

    source.send({ type: 'snapshot', event: { ...EVENT, squads: [SPACE] } });
    await waitFor(() =>
      expect(select.selectedOptions[0]?.textContent).toBe('All players'),
    );
    // Aeryn's claim is still Froge's, but with Froge gone it has no token.
    expect(rowsOf(pointTable('P4: Enrage'))).toEqual([
      ['Aeryn Vail PLD', ''],
      CASS_ROW,
    ]);
  });
});

describe('grouping by squad', () => {
  it("splits the shown point into each squad's section, then the unclaimed, and is remembered next time", async () => {
    await openLiveBoard('/events/event-1?enc=FRU&pp=40');

    fireEvent.click(screen.getByRole('button', { name: 'By squad' }));

    expect(rowsOf(pointTable('P4: Enrage'))).toEqual([
      ['Froge Army · 1'],
      AERYN_ROW,
      ['Unclaimed · 1'],
      CASS_ROW,
    ]);

    show('Froge Army only');
    expect(rowsOf(pointTable('P4: Enrage'))).toEqual([
      ['Froge Army · 1'],
      AERYN_ROW,
    ]);

    cleanup();
    await openLiveBoard('/events/event-1?enc=FRU&pp=40');
    expect(rowsOf(pointTable('P4: Enrage'))[0]).toEqual(['Froge Army · 1']);
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
    await screen.findByRole('tabpanel', { name: ENCOUNTER_PANEL });

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

describe('a player synced from Raid-Helper', () => {
  it('shows their role where a picked job would be', async () => {
    const gale = participant({
      discordId: 'p7',
      character: 'Gale Rune',
      job: null,
      role: 'regen',
    });
    await openLiveBoard('/events/event-1?enc=FRU&pp=40', {
      ...EVENT,
      participants: [gale],
    });

    expect(rowsOf(pointTable('P4: Enrage'))).toEqual([['Gale Rune Regen', '']]);
  });
});
