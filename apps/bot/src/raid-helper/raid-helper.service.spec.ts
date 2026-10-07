import { readFileSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import { test as base, describe, expect } from 'vitest';
import { fresh } from '../test-utils/fixtures.js';
import { getRaidHelperApiToken } from './raid-helper.consts.js';
import type { RaidHelperApi } from './raid-helper.interfaces.js';
import { RaidHelperService } from './raid-helper.service.js';

/** A real event response (ids and names anonymised). */
const RECORDED_EVENT: unknown = JSON.parse(
  readFileSync(new URL('./__fixtures__/event.json', import.meta.url), 'utf8'),
);
/** What raid-helper answers, with HTTP 404, for an id it has no event for. */
const UNKNOWN_EVENT = Object.freeze({
  reason: 'unknown event',
  status: 'failed',
});

const serviceAnswering = async (body: unknown) => {
  const api: RaidHelperApi = { getEvent: () => Promise.resolve(body) };
  const moduleRef = await Test.createTestingModule({
    providers: [
      RaidHelperService,
      { provide: getRaidHelperApiToken(), useValue: api },
    ],
  }).compile();
  return moduleRef.get(RaidHelperService);
};

const it = base.extend<{ recorded: RaidHelperService }>({
  recorded: fresh(() => serviceAnswering(RECORDED_EVENT)),
});

describe('RaidHelperService', () => {
  describe('when raid-helper serves the event', () => {
    it('reads its title and each sign-up, keeping a missing spec missing', async ({
      recorded,
    }) => {
      await expect(recorded.getEvent('event-1')).resolves.toEqual({
        id: 'event-1',
        title: 'Dancing Mad Reclear',
        signUps: [
          {
            userId: 'user-1',
            name: 'Player 1',
            className: 'Allrounder',
            position: 1,
          },
          {
            userId: 'user-2',
            name: 'Player 2',
            className: 'Magical',
            specName: 'Blackmage',
            position: 3,
          },
          {
            userId: 'user-3',
            name: 'Player 3',
            className: 'Tank',
            specName: 'PaladinFF',
            position: 5,
          },
          {
            userId: 'user-4',
            name: 'Player 4',
            className: 'Melee',
            specName: 'Dragoon',
            position: 6,
          },
          {
            userId: 'user-5',
            name: 'Player 5',
            className: 'Tank',
            specName: 'Darkknight',
            position: 2,
          },
          {
            userId: 'user-6',
            name: 'Player 6',
            className: 'Melee',
            specName: 'MonkFF',
            position: 8,
          },
          {
            userId: 'user-7',
            name: 'Player 7',
            className: 'Ranged',
            specName: 'Bard',
            position: 9,
          },
          {
            userId: 'user-8',
            name: 'Player 8',
            className: 'Allrounder',
            position: 4,
          },
          {
            userId: 'user-9',
            name: 'Player 9',
            className: 'Healer',
            specName: 'Whitemage',
            position: 7,
          },
        ],
      });
    });
  });

  describe('when raid-helper has no event with that id', () => {
    it('finds no event', async () => {
      const service = await serviceAnswering(UNKNOWN_EVENT);

      await expect(service.getEvent('1')).resolves.toBeUndefined();
    });
  });
});
