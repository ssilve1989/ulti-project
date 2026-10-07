import type { RaidHelperApi } from '../../raid-helper/raid-helper.interfaces.js';

export interface FakeSignUp {
  userId: string;
  name: string;
  className: string;
  /** left out, as raid-helper does, for classes without specs (e.g. Allrounder) */
  specName?: string;
  /** defaults to the sign-up's place in the list, from 1 */
  position?: number;
}

/**
 * Stands in for the raid-helper API behind its token, so the real
 * RaidHelperService parses what it returns. Bodies mirror the live API,
 * including the failure body it sends for an unknown event.
 */
export class RaidHelperMock implements RaidHelperApi {
  private readonly events = new Map<string, object>();
  private offline = false;

  addEvent(
    id: string,
    { title, signUps }: { title: string; signUps: FakeSignUp[] },
  ): void {
    this.events.set(id, {
      id,
      title,
      signUps: signUps.map((signUp, i) => ({
        status: 'primary',
        position: i + 1,
        ...signUp,
      })),
    });
  }

  /** Every request fails the way a network outage does. */
  goOffline(): void {
    this.offline = true;
  }

  getEvent(eventId: string): Promise<unknown> {
    if (this.offline) {
      return Promise.reject(
        new TypeError('fetch failed', {
          cause: new Error('getaddrinfo ENOTFOUND raid-helper.xyz'),
        }),
      );
    }
    return Promise.resolve(
      this.events.get(eventId) ?? { reason: 'unknown event', status: 'failed' },
    );
  }
}
