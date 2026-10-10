import { describe, expect, it } from 'vitest';
import { syncReply } from './sync-event.command-handler.js';

describe('the sync reply', () => {
  it('fits Discord by cutting the skipped list with how many it left out', () => {
    const skipped = Array.from({ length: 100 }, (_, i) => ({
      name: `Player number ${i} with a long name`,
      reason: 'no prog-point role' as const,
    }));

    const reply = syncReply('Synced **Event**', {
      added: 0,
      updated: 0,
      removed: 0,
      skipped,
    });

    expect(reply.length).toBeLessThanOrEqual(2000);
    expect(reply).toMatch(/\n…and \d+ more$/);
  });
});
