// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { App } from '../app';
import { json, stubApi } from '../test-utils/api-stub';
import { FROGE, meResponse, SPACE } from '../test-utils/fixtures';

const GET_ME = Object.freeze({
  method: 'GET',
  path: '/api/me',
  body: undefined,
  contentType: null,
});
const GET_EVENTS = Object.freeze({
  method: 'GET',
  path: '/api/events',
  body: undefined,
  contentType: null,
});
const signedOut = () => json(401, { reason: 'signed-out' });
const noEvents = () => json(200, []);
const discordRedirect = () =>
  json(200, { url: 'https://discord.com/oauth2/authorize?x', redirect: true });
// What better-auth answers when an endpoint throws unexpectedly.
const authServerError = () =>
  new Response(null, { status: 500, statusText: 'Internal Server Error' });

function openAt(url: string): void {
  history.replaceState(null, '', url);
  render(() => <App />);
}

/** Opens the account menu from the top bar's account button. */
async function openAccountMenu(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /Aeryn/ }));
}

async function heading(): Promise<string | null> {
  return (await screen.findByRole('heading')).textContent;
}

describe('when nobody is signed in', () => {
  it('offers to sign in with Discord, back to the page they opened', async () => {
    const { sent } = stubApi({
      'GET /api/me': signedOut,
      'POST /api/auth/sign-in/social': discordRedirect,
    });
    openAt('/');

    expect(await heading()).toBe('Claim. Build. Post.');
    // The live preview is decoration: screen readers skip it and Tab never stops in it.
    const preview = screen
      .getByText('LIVE · FRU · PROG PARTY')
      .closest('[aria-hidden="true"]');
    expect(
      preview?.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]',
      ).length,
    ).toBe(0);
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with Discord' }),
    );

    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual({
      method: 'POST',
      path: '/api/auth/sign-in/social',
      body: JSON.stringify({ provider: 'discord', callbackURL: '/' }),
      contentType: 'application/json',
    });
  });

  it('says so when signing in cannot start, in place of an earlier Discord error', async () => {
    const { sent } = stubApi({
      'GET /api/me': signedOut,
      'POST /api/auth/sign-in/social': authServerError,
    });
    openAt('/?error=state_not_found');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Sign in with Discord' }),
    );

    // getByRole throws while two alerts show, so this also proves Discord's error is gone.
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        "Couldn't start signing in. Please try again.",
      ),
    );
    expect(sent).toEqual([
      GET_ME,
      {
        method: 'POST',
        path: '/api/auth/sign-in/social',
        body: JSON.stringify({ provider: 'discord', callbackURL: '/' }),
        contentType: 'application/json',
      },
    ]);
  });

  describe('and Discord sent them back with an error', () => {
    it('says the sign-in was cancelled when they declined on Discord', async () => {
      stubApi({ 'GET /api/me': signedOut });
      openAt('/?error=access_denied');

      expect((await screen.findByRole('alert')).textContent).toBe(
        'Sign-in was cancelled on Discord.',
      );
    });

    it('asks them to try again for any other error, and drops the error from the return path', async () => {
      const { sent } = stubApi({
        'GET /api/me': signedOut,
        'POST /api/auth/sign-in/social': discordRedirect,
      });
      openAt('/?error=state_not_found');

      expect((await screen.findByRole('alert')).textContent).toBe(
        "Signing in with Discord didn't work. Please try again.",
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Sign in with Discord' }),
      );
      await waitFor(() => expect(sent).toHaveLength(2));
      expect(sent[1]?.body).toBe(
        JSON.stringify({ provider: 'discord', callbackURL: '/' }),
      );
    });
  });
});

describe.each([
  {
    reason: 'not-in-guild',
    message: "Your Discord account isn't in the Ulti Project server.",
  },
  {
    reason: 'no-role',
    message:
      "Your Discord account doesn't have a board role. Ask an admin for one.",
  },
])('when the member is refused with $reason', ({ reason, message }) => {
  it('says they have no access and why, with a way to sign out', async () => {
    stubApi({ 'GET /api/me': json(403, { reason }) });
    openAt('/');

    expect(await heading()).toBe("You don't have access");
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });
});

describe('when the API fails', () => {
  it('says the board is unreachable, and Try again shows the board once it answers', async () => {
    let answer = json(500, { reason: 'internal' });
    const { sent } = stubApi({
      'GET /api/me': () => answer,
      'GET /api/events': noEvents,
    });
    openAt('/');

    expect(await heading()).toBe("The board isn't reachable right now");
    answer = json(200, meResponse({ kind: 'viewer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('read-only')).toBeTruthy();
    await waitFor(() => expect(sent).toEqual([GET_ME, GET_ME, GET_EVENTS]));
  });
});

describe('when a squad lead is signed in', () => {
  it('shows their avatar, name and squad token in the top bar', async () => {
    stubApi({
      'GET /api/me': json(200, meResponse({ kind: 'squad', squad: FROGE })),
      'GET /api/events': noEvents,
    });
    openAt('/');

    const token = await screen.findByRole('img', {
      name: 'Your squad: Froge Army',
    });
    expect(token.textContent).toBe('FRG');
    expect(screen.getByText('Aeryn')).toBeTruthy();
    expect(screen.getByRole('presentation').getAttribute('src')).toBe(
      'https://cdn.discordapp.com/avatars/lead-1/a.png',
    );
  });

  it('signs out and returns to the sign-in screen', async () => {
    let me = json(200, meResponse({ kind: 'squad', squad: FROGE }));
    const { sent } = stubApi({
      'GET /api/me': () => me,
      'GET /api/events': noEvents,
      'POST /api/auth/sign-out': json(200, { success: true }),
    });
    openAt('/');

    await screen.findByText('No open events.');
    await openAccountMenu();
    const signOut = screen.getByRole('button', { name: 'Sign out' });
    me = signedOut();
    fireEvent.click(signOut);

    expect(
      await screen.findByRole('heading', {
        name: 'Claim. Build. Post.',
      }),
    ).toBeTruthy();
    expect(sent).toEqual([
      GET_ME,
      GET_EVENTS,
      {
        method: 'POST',
        path: '/api/auth/sign-out',
        body: '{}',
        contentType: 'application/json',
      },
      GET_ME,
    ]);
  });

  it('says so when signing out fails, and stays signed in', async () => {
    const { sent } = stubApi({
      'GET /api/me': json(200, meResponse({ kind: 'squad', squad: FROGE })),
      'GET /api/events': noEvents,
      'POST /api/auth/sign-out': authServerError,
    });
    openAt('/');

    await screen.findByText('No open events.');
    await openAccountMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      "Couldn't sign out. Please try again.",
    );
    expect(screen.getByText('Aeryn')).toBeTruthy();
    expect(sent).toEqual([
      GET_ME,
      GET_EVENTS,
      {
        method: 'POST',
        path: '/api/auth/sign-out',
        body: '{}',
        contentType: 'application/json',
      },
    ]);
  });

  it('says so when the network fails while signing out', async () => {
    const { sent } = stubApi({
      'GET /api/me': json(200, meResponse({ kind: 'squad', squad: FROGE })),
      'GET /api/events': noEvents,
      // How `fetch` fails when the network is down.
      'POST /api/auth/sign-out': () =>
        Promise.reject(new TypeError('Failed to fetch')),
    });
    openAt('/');

    await screen.findByText('No open events.');
    await openAccountMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      "Couldn't sign out. Please try again.",
    );
    expect(sent).toEqual([
      GET_ME,
      GET_EVENTS,
      {
        method: 'POST',
        path: '/api/auth/sign-out',
        body: '{}',
        contentType: 'application/json',
      },
    ]);
  });
});

describe('when a viewer is signed in', () => {
  it('marks the board read-only', async () => {
    stubApi({
      'GET /api/me': json(200, meResponse({ kind: 'viewer' })),
      'GET /api/events': noEvents,
    });
    openAt('/');

    expect(await screen.findByText('read-only')).toBeTruthy();
  });
});

describe('when a member holds two squad roles', () => {
  it('tells them to ask an admin', async () => {
    stubApi({
      'GET /api/me': json(
        200,
        meResponse({ kind: 'squad-conflict', squads: [FROGE, SPACE] }),
      ),
      'GET /api/events': noEvents,
    });
    openAt('/');

    expect(
      await screen.findByText('two squad roles: ask an admin'),
    ).toBeTruthy();
  });
});

describe('theme', () => {
  const radio = (name: string) =>
    screen.getByRole<HTMLInputElement>('radio', { name });

  it('follows the system theme until they choose one', async () => {
    stubApi({
      'GET /api/me': json(200, meResponse({ kind: 'viewer' })),
      'GET /api/events': noEvents,
    });
    openAt('/');
    await openAccountMenu();

    expect(radio('Match system').checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('switches to dark and remembers it', async () => {
    stubApi({
      'GET /api/me': json(200, meResponse({ kind: 'viewer' })),
      'GET /api/events': noEvents,
    });
    openAt('/');
    await screen.findByText('No open events.');
    expect(screen.queryByRole('radio', { name: 'Dark' })).toBeNull();
    await openAccountMenu();

    fireEvent.click(radio('Dark'));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('board-theme')).toBe('dark');
    expect(radio('Dark').checked).toBe(true);
  });

  it('shows the stored theme as chosen, and goes back to the system theme', async () => {
    localStorage.setItem('board-theme', 'dark');
    document.documentElement.dataset.theme = 'dark';
    stubApi({
      'GET /api/me': json(200, meResponse({ kind: 'viewer' })),
      'GET /api/events': noEvents,
    });
    openAt('/');
    await openAccountMenu();
    expect(radio('Dark').checked).toBe(true);

    fireEvent.click(radio('Match system'));

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('board-theme')).toBe('system');
  });
});
