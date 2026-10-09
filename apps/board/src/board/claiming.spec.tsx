// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@solidjs/testing-library';
import type { BoardAccess, BoardEvent } from '@ulti-project/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { json, stubApi } from '../test-utils/api-stub';
import { boardEvent, FROGE, participant, SPACE } from '../test-utils/fixtures';
import {
  claimBy,
  GET_HELPERS,
  GET_ME,
  held,
  openBoard,
} from '../test-utils/open-board';

const aeryn = participant({ discordId: 'p1', character: 'Aeryn Vail' });
const bricktop = participant({
  discordId: 'p3',
  character: 'Bricktop',
  job: 'WAR',
  phase: { label: 'P3: Apocalypse', order: 30, bucket: 'prog' },
  claim: claimBy(SPACE.id),
});
const EVENT: BoardEvent = Object.freeze(
  boardEvent({ participants: [aeryn, bricktop] }),
);
const aerynClaimedBy = (squadId: string) => ({
  ...aeryn,
  claim: claimBy(squadId),
});

const AS_FROGE: BoardAccess = Object.freeze({ kind: 'squad', squad: FROGE });
const CLAIM_PATH = `/api/events/event-1/participants/${aeryn.id}/claim`;
const CLAIM = `POST ${CLAIM_PATH}`;
const RELEASE = `DELETE ${CLAIM_PATH}`;
const SENT_CLAIM = Object.freeze({
  method: 'POST',
  path: CLAIM_PATH,
  body: '{}',
  contentType: 'application/json',
});
const SENT_RELEASE = Object.freeze({
  method: 'DELETE',
  path: CLAIM_PATH,
  body: undefined,
  contentType: null,
});

const AERYN_FREE = ['Aeryn Vail PLD', 'P4: Enrage', '＋'];
const AERYN_FRG = ['Aeryn Vail PLD', 'P4: Enrage', 'FRG'];
const AERYN_SPC = ['Aeryn Vail PLD', 'P4: Enrage', 'SPC'];
const BRICKTOP_ROW = ['Bricktop WAR', 'P3: Apocalypse', 'SPC'];
const UNREACHABLE = "Couldn't reach the board. Try again.";
const CLAIMED_STRIP = Object.freeze([
  'Claimed Aeryn Vail for Froge Army',
  'Undo',
  'Dismiss',
]);

const CLAIM_AERYN = 'Claim Aeryn Vail for Froge Army';
const RELEASE_AERYN = 'Release Aeryn Vail from Froge Army';

beforeEach(() => {
  // jsdom has no matchMedia; this is a browser whose system theme is light.
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

/** Opens event-1's FRU board as `access` (a Froge member by default), after its snapshot. */
const openFrogeBoard = (
  routes: Parameters<typeof stubApi>[0] = {},
  options: { access?: BoardAccess; event?: BoardEvent } = {},
) =>
  openBoard({
    access: options.access ?? AS_FROGE,
    event: options.event ?? EVENT,
    routes,
  });

function progRows(): string[][] {
  const table = screen.getByRole('table', {
    name: 'Futures Rewritten Prog party',
  });
  return Array.from(table.querySelectorAll('tbody tr'), (row) =>
    Array.from(row.querySelectorAll('td'), (cell) => cell.textContent ?? ''),
  );
}

const progStatus = () =>
  within(screen.getByRole('region', { name: 'Prog Party' })).getByRole(
    'status',
  );

/** The Prog party's undo strip: its message, then its buttons' names; empty when hidden. */
function strip(): string[] {
  const status = progStatus();
  if (status.textContent === '') return [];
  const buttons = status.parentElement?.querySelectorAll('button') ?? [];
  return [
    status.textContent ?? '',
    ...Array.from(
      buttons,
      (button) => button.getAttribute('aria-label') ?? button.textContent ?? '',
    ),
  ];
}

const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('a user who cannot claim', () => {
  // Cass is Froge's claim: a Froge member on a closed event can't release her either.
  const withFrogeClaim: BoardEvent = Object.freeze({
    ...EVENT,
    participants: [
      ...EVENT.participants,
      participant({
        discordId: 'p2',
        character: 'Cass Ember',
        claim: claimBy(FROGE.id),
      }),
    ],
  });

  it.each<{
    who: string;
    access: BoardAccess;
    status: BoardEvent['status'];
  }>([
    { who: 'a viewer', access: { kind: 'viewer' }, status: 'open' },
    {
      who: 'a member of two squads',
      access: { kind: 'squad-conflict', squads: [FROGE, SPACE] },
      status: 'open',
    },
    {
      who: 'a squad member on a closed event',
      access: AS_FROGE,
      status: 'closed',
    },
  ])('sees tokens and no controls as $who', async ({ access, status }) => {
    await openFrogeBoard({}, { access, event: { ...withFrogeClaim, status } });

    expect(progRows()).toEqual([
      ['Aeryn Vail PLD', 'P4: Enrage', ''],
      ['Cass Ember PLD', 'P4: Enrage', 'FRG'],
      BRICKTOP_ROW,
    ]);
    expect(
      screen.queryAllByRole('button', { name: /^(Claim|Release) / }),
    ).toEqual([]);
  });
});

describe('claiming a player', () => {
  it('shows the claim at once with its control disabled, then offers Undo once the API agrees', async () => {
    const answer = held();
    const { sent } = await openFrogeBoard({ [CLAIM]: answer.route });
    // Mounted empty before any notice, so screen readers announce the first one.
    expect(progStatus().textContent).toBe('');

    click(CLAIM_AERYN);

    expect(progRows()).toEqual([AERYN_FRG, BRICKTOP_ROW]);
    const release = screen.getByRole('button', { name: RELEASE_AERYN });
    expect(release.hasAttribute('disabled')).toBe(true);
    await waitFor(() =>
      expect(sent).toEqual([GET_ME, GET_HELPERS, SENT_CLAIM]),
    );

    answer.answer(json(200, aerynClaimedBy(FROGE.id)));

    await waitFor(() => expect(strip()).toEqual(CLAIMED_STRIP));
    expect(release.hasAttribute('disabled')).toBe(false);
  });

  it('is released again by Undo, and that release offers no Undo', async () => {
    const { sent } = await openFrogeBoard({
      [CLAIM]: json(200, aerynClaimedBy(FROGE.id)),
      [RELEASE]: json(200, aeryn),
    });
    click(CLAIM_AERYN);
    await waitFor(() => expect(strip()).toEqual(CLAIMED_STRIP));

    click('Undo');

    await waitFor(() =>
      expect(strip()).toEqual(['Released Aeryn Vail', 'Dismiss']),
    );
    expect(progRows()).toEqual([AERYN_FREE, BRICKTOP_ROW]);
    expect(sent).toEqual([GET_ME, GET_HELPERS, SENT_CLAIM, SENT_RELEASE]);
  });

  it('shows the real owner when another squad got there first', async () => {
    await openFrogeBoard({
      [CLAIM]: json(409, { reason: 'claimed', claim: claimBy(SPACE.id) }),
    });

    click(CLAIM_AERYN);

    await waitFor(() =>
      expect(strip()).toEqual([
        'Already claimed by Space Travelers',
        'Dismiss',
      ]),
    );
    expect(progRows()).toEqual([AERYN_SPC, BRICKTOP_ROW]);
  });

  it('is rolled back when the player is no longer signed up', async () => {
    await openFrogeBoard({ [CLAIM]: json(404, { reason: 'not-found' }) });

    click(CLAIM_AERYN);

    await waitFor(() =>
      expect(strip()).toEqual([
        'Aeryn Vail is no longer signed up.',
        'Dismiss',
      ]),
    );
    expect(progRows()).toEqual([AERYN_FREE, BRICKTOP_ROW]);
  });

  it.each([
    {
      answer: 'the network fails',
      route: () => Promise.reject(new TypeError('Failed to fetch')),
    },
    {
      answer: 'a proxy answers with an HTML error page',
      route: () =>
        new Response('<html><body>Bad Gateway</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
    },
  ])('is rolled back when $answer', async ({ route }) => {
    await openFrogeBoard({ [CLAIM]: route });

    click(CLAIM_AERYN);

    await waitFor(() => expect(strip()).toEqual([UNREACHABLE, 'Dismiss']));
    expect(progRows()).toEqual([AERYN_FREE, BRICKTOP_ROW]);
  });
});

describe("another squad's claim arriving while a claim is in flight", () => {
  it('shows that squad once the API refuses ours', async () => {
    const answer = held();
    const { source } = await openFrogeBoard({ [CLAIM]: answer.route });
    click(CLAIM_AERYN);

    source.send({
      type: 'participant-upserted',
      participant: aerynClaimedBy(SPACE.id),
    });
    answer.answer(json(409, { reason: 'claimed', claim: claimBy(SPACE.id) }));

    await waitFor(() =>
      expect(strip()).toEqual([
        'Already claimed by Space Travelers',
        'Dismiss',
      ]),
    );
    expect(progRows()).toEqual([AERYN_SPC, BRICKTOP_ROW]);
  });

  it('is not undone by rolling ours back when the network fails', async () => {
    const answer = held();
    const { source } = await openFrogeBoard({ [CLAIM]: answer.route });
    click(CLAIM_AERYN);

    source.send({
      type: 'participant-upserted',
      participant: aerynClaimedBy(SPACE.id),
    });
    answer.failNetwork();

    await waitFor(() => expect(strip()).toEqual([UNREACHABLE, 'Dismiss']));
    expect(progRows()).toEqual([AERYN_SPC, BRICKTOP_ROW]);
  });
});

describe('a player who withdraws while a claim is in flight', () => {
  it('stays gone when the claim is then confirmed', async () => {
    const answer = held();
    const { source } = await openFrogeBoard({ [CLAIM]: answer.route });
    click(CLAIM_AERYN);

    source.send({ type: 'participant-removed', participantId: aeryn.id });
    answer.answer(json(200, aerynClaimedBy(FROGE.id)));

    await waitFor(() => expect(strip()).toEqual(CLAIMED_STRIP));
    expect(progRows()).toEqual([BRICKTOP_ROW]);
  });
});

describe("releasing one of your squad's players", () => {
  it('shows the release with Undo, and Undo claims them again', async () => {
    const { sent } = await openFrogeBoard(
      {
        [RELEASE]: json(200, aeryn),
        [CLAIM]: json(200, aerynClaimedBy(FROGE.id)),
      },
      {
        event: { ...EVENT, participants: [aerynClaimedBy(FROGE.id), bricktop] },
      },
    );

    click(RELEASE_AERYN);
    await waitFor(() =>
      expect(strip()).toEqual(['Released Aeryn Vail', 'Undo', 'Dismiss']),
    );
    expect(progRows()).toEqual([AERYN_FREE, BRICKTOP_ROW]);

    click('Undo');

    await waitFor(() =>
      expect(strip()).toEqual(['Claimed Aeryn Vail for Froge Army', 'Dismiss']),
    );
    expect(progRows()).toEqual([AERYN_FRG, BRICKTOP_ROW]);
    expect(sent).toEqual([GET_ME, GET_HELPERS, SENT_RELEASE, SENT_CLAIM]);
  });

  it('is rolled back when the network fails', async () => {
    await openFrogeBoard(
      { [RELEASE]: () => Promise.reject(new TypeError('Failed to fetch')) },
      {
        event: { ...EVENT, participants: [aerynClaimedBy(FROGE.id), bricktop] },
      },
    );

    click(RELEASE_AERYN);

    await waitFor(() => expect(strip()).toEqual([UNREACHABLE, 'Dismiss']));
    expect(progRows()).toEqual([AERYN_FRG, BRICKTOP_ROW]);
  });
});

describe('the undo strip', () => {
  it('hides itself 5 seconds after it appears', async () => {
    // Only timeouts are faked: testing-library polls on a real interval.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await openFrogeBoard({ [CLAIM]: json(200, aerynClaimedBy(FROGE.id)) });
    click(CLAIM_AERYN);
    await waitFor(() => expect(strip()).toEqual(CLAIMED_STRIP));

    vi.advanceTimersByTime(4999);
    expect(strip()).toEqual(CLAIMED_STRIP);
    vi.advanceTimersByTime(1);
    expect(strip()).toEqual([]);
  });

  it('hides at once when dismissed', async () => {
    await openFrogeBoard({ [CLAIM]: json(200, aerynClaimedBy(FROGE.id)) });
    click(CLAIM_AERYN);
    await waitFor(() => expect(strip()).toEqual(CLAIMED_STRIP));

    click('Dismiss');

    expect(strip()).toEqual([]);
  });
});
