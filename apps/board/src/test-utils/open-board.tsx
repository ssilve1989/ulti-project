import { render, screen, waitFor } from '@solidjs/testing-library';
import type { BoardAccess, BoardEvent } from '@ulti-project/shared';
import { expect } from 'vitest';
import { App } from '../app';
import { json, stubApi } from './api-stub';
import {
  type FakeEventSource,
  installFakeEventSource,
} from './fake-event-source';
import { meResponse } from './fixtures';

export const claimBy = (squadId: string) =>
  Object.freeze({
    squadId,
    claimedBy: 'lead-1',
    claimedAt: '2026-10-09T18:00:00.000Z',
  });

/** The encounter's tab panel's name ("FRU, 5 signed up"); a prog point's panel is named after its label. */
export const ENCOUNTER_PANEL = /^[A-Z]+, \d+ signed up$/;

export const encounterPanel = () =>
  screen.getByRole('tabpanel', { name: ENCOUNTER_PANEL });

export const GET_ME = Object.freeze({
  method: 'GET',
  path: '/api/me',
  body: undefined,
  contentType: null,
});

/** A squad member's board asks for the squad's helpers once, for its Teams section. */
export const GET_HELPERS = Object.freeze({
  method: 'GET',
  path: '/api/squads/mine/helpers',
  body: undefined,
  contentType: null,
});

/**
 * Opens the board at `url` as `access` (a viewer by default), answering `/api/me` and the
 * squad's helpers (none) unless `routes` say otherwise. With `event`, the stream sends it as
 * the snapshot and the board is shown before this returns.
 */
export async function openBoard(
  options: {
    readonly url?: string;
    readonly access?: BoardAccess;
    readonly event?: BoardEvent;
    readonly routes?: Parameters<typeof stubApi>[0];
  } = {},
): Promise<{
  source: FakeEventSource;
  sent: ReturnType<typeof stubApi>['sent'];
}> {
  const { sent } = stubApi({
    'GET /api/me': () =>
      json(200, meResponse(options.access ?? { kind: 'viewer' })),
    'GET /api/squads/mine/helpers': json(200, []),
    ...options.routes,
  });
  const sources = installFakeEventSource();
  history.replaceState(null, '', options.url ?? '/events/event-1?enc=FRU');
  render(() => <App />);
  await waitFor(() => expect(sources).toHaveLength(1));
  const [source] = sources;
  if (source === undefined) throw new Error('No EventSource was opened');
  if (options.event) {
    source.send({ type: 'snapshot', event: options.event });
    await screen.findByRole('tabpanel', { name: ENCOUNTER_PANEL });
  }
  return { source, sent };
}

/** An API answer the test gives later, so it can look at the board in between. */
export function held() {
  const { promise, resolve, reject } = Promise.withResolvers<Response>();
  return {
    route: () => promise,
    answer: resolve,
    failNetwork: () => reject(new TypeError('Failed to fetch')),
  };
}
