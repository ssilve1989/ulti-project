// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import type { BoardEventSummary } from '@ulti-project/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app';
import { formatStart } from '../format';
import { json, stubApi } from '../test-utils/api-stub';
import { meResponse } from '../test-utils/fixtures';

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
const signedIn = () => json(200, meResponse({ kind: 'viewer' }));

const EVENTS: readonly BoardEventSummary[] = Object.freeze([
  {
    id: 'event-1',
    title: 'Saturday FRU',
    startsAt: '2026-10-10T00:00:00.000Z',
    encounters: ['FRU'],
    participantCount: 12,
  },
  {
    id: 'event-2',
    title: 'Ultimate Sunday',
    startsAt: '2026-10-11T19:30:00.000Z',
    encounters: ['TOP', 'DSR'],
    participantCount: 0,
  },
]);

function openHome(): void {
  history.replaceState(null, '', '/');
  render(() => <App />);
}

beforeEach(() => {
  // jsdom has no matchMedia; this is a browser whose system theme is light.
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

describe('when there are open events', () => {
  it('lists each one as a link to its board with its time, encounters and sign-up count', async () => {
    stubApi({ 'GET /api/me': signedIn, 'GET /api/events': json(200, EVENTS) });
    openHome();

    await screen.findByRole('heading', { name: 'Open events' });
    const links = await screen.findAllByRole('link', { name: /signed up$/ });

    expect(
      links.map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      [
        `Saturday FRU${formatStart('2026-10-10T00:00:00.000Z')}FRU12 signed up`,
        '/events/event-1',
      ],
      [
        `Ultimate Sunday${formatStart('2026-10-11T19:30:00.000Z')}TOPDSR0 signed up`,
        '/events/event-2',
      ],
    ]);
    expect(
      links.map((link) => link.querySelector('time')?.getAttribute('datetime')),
    ).toEqual(['2026-10-10T00:00:00.000Z', '2026-10-11T19:30:00.000Z']);
  });
});

describe('when there are no open events', () => {
  it('says so', async () => {
    stubApi({ 'GET /api/me': signedIn, 'GET /api/events': json(200, []) });
    openHome();

    expect(await screen.findByText('No open events.')).toBeTruthy();
  });
});

describe('when the session has ended', () => {
  it('asks who is signed in again and shows the sign-in screen', async () => {
    let me = signedIn();
    const { sent } = stubApi({
      'GET /api/me': () => me,
      'GET /api/events': () => {
        me = json(401, { reason: 'signed-out' });
        return json(401, { reason: 'signed-out' });
      },
    });
    openHome();

    expect(
      await screen.findByRole('heading', {
        name: 'Sign in to the Ulti Project board',
      }),
    ).toBeTruthy();
    expect(sent).toEqual([GET_ME, GET_EVENTS, GET_ME]);
  });
});

describe('when the events fail to load', () => {
  it('says so, and Try again lists them once the API answers', async () => {
    let answer = json(500, { reason: 'internal' });
    const { sent } = stubApi({
      'GET /api/me': signedIn,
      'GET /api/events': () => answer,
    });
    openHome();

    expect(await screen.findByText("Couldn't load events.")).toBeTruthy();
    answer = json(200, []);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No open events.')).toBeTruthy();
    await waitFor(() => expect(sent).toEqual([GET_ME, GET_EVENTS, GET_EVENTS]));
  });
});
