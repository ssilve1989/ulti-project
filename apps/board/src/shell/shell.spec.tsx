// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app';
import { json, stubApi } from '../test-utils/api-stub';
import { FROGE, meResponse, SPACE } from '../test-utils/fixtures';
import { applyTheme, readStoredTheme } from './theme';

const GET_ME = Object.freeze({
  method: 'GET',
  path: '/api/me',
  body: undefined,
  contentType: null,
});
const signedOut = () => json(401, { reason: 'signed-out' });
const discordRedirect = () =>
  json(200, { url: 'https://discord.com/oauth2/authorize?x', redirect: true });

function openAt(url: string): void {
  history.replaceState(null, '', url);
  render(() => <App />);
}

async function heading(): Promise<string | null> {
  return (await screen.findByRole('heading')).textContent;
}

beforeEach(() => {
  // jsdom has no matchMedia; this is a browser whose system theme is light.
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

describe('when nobody is signed in', () => {
  it('offers to sign in with Discord, back to the page they opened', async () => {
    const { sent } = stubApi({
      'GET /api/me': signedOut,
      'POST /api/auth/sign-in/social': discordRedirect,
    });
    openAt('/');

    expect(await heading()).toBe('Sign in to the Ulti Project board');
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
    const { sent } = stubApi({ 'GET /api/me': () => answer });
    openAt('/');

    expect(await heading()).toBe("The board isn't reachable right now");
    answer = json(200, meResponse({ kind: 'viewer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('read-only')).toBeTruthy();
    expect(sent).toEqual([GET_ME, GET_ME]);
  });
});

describe('when a squad lead is signed in', () => {
  it('shows their avatar, name and squad token in the top bar', async () => {
    stubApi({
      'GET /api/me': json(200, meResponse({ kind: 'squad', squad: FROGE })),
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
      'POST /api/auth/sign-out': json(200, { success: true }),
    });
    openAt('/');

    const signOut = await screen.findByRole('button', { name: 'Sign out' });
    me = signedOut();
    fireEvent.click(signOut);

    expect(await heading()).toBe('Sign in to the Ulti Project board');
    expect(sent).toEqual([
      GET_ME,
      {
        method: 'POST',
        path: '/api/auth/sign-out',
        body: '{}',
        contentType: 'application/json',
      },
      GET_ME,
    ]);
  });
});

describe('when a viewer is signed in', () => {
  it('marks the board read-only', async () => {
    stubApi({ 'GET /api/me': json(200, meResponse({ kind: 'viewer' })) });
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
    });
    openAt('/');

    expect(
      await screen.findByText('two squad roles: ask an admin'),
    ).toBeTruthy();
  });
});

describe('theme', () => {
  it('switches to dark and remembers it', async () => {
    stubApi({ 'GET /api/me': json(200, meResponse({ kind: 'viewer' })) });
    openAt('/');

    fireEvent.click(await screen.findByRole('button', { name: 'Dark theme' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('board-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Light theme' })).toBeTruthy();
  });

  it('applies a stored theme on load', async () => {
    localStorage.setItem('board-theme', 'dark');
    stubApi({ 'GET /api/me': json(200, meResponse({ kind: 'viewer' })) });

    applyTheme(readStoredTheme());
    openAt('/');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(
      await screen.findByRole('button', { name: 'Light theme' }),
    ).toBeTruthy();
  });
});
