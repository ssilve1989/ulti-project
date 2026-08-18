import { ActivityType } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickRandomStatus, STATUS_CATEGORIES } from './bot-status.consts.js';

describe('pickRandomStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks the first purpose message when both random rolls are low', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);

    const status = pickRandomStatus();

    expect(status).toEqual(STATUS_CATEGORIES.purpose[0]);
  });

  it('picks the last insideJokes message when both random rolls are high', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.99);

    const status = pickRandomStatus();

    expect(status).toEqual(
      STATUS_CATEGORIES.insideJokes[STATUS_CATEGORIES.insideJokes.length - 1],
    );
  });

  it('always returns a message belonging to one of the known categories', () => {
    const allMessages = Object.values(STATUS_CATEGORIES).flat();

    const status = pickRandomStatus();

    expect(allMessages).toContainEqual(status);
    expect(Object.values(ActivityType)).toContain(status.type);
  });
});
