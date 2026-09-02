import { describe, expect, it } from 'vitest';
import { toPublicSignup } from './public-signup.ts';

describe('toPublicSignup', () => {
  it('returns only the allowlisted fields, dropping every internal field', () => {
    const decoded: Record<string, unknown> = {
      character: 'Kholi Ruz',
      world: 'Gilgamesh',
      role: 'H1',
      progPoint: 'Enrage',
      partyStatus: 'Clear Party',
      // internal fields that MUST NOT appear in output:
      discordId: '123456789',
      username: 'kholi',
      reviewedBy: '987654321',
      declineReason: 'not enough prog',
      reviewMessageId: '555',
      screenshot: 'https://cdn.discord/x.png',
      proofOfProgLink: 'https://fflogs/y',
      notes: 'private note',
      availability: 'weeknights',
      progPointRequested: 'P4',
      status: 'APPROVED',
      expiresAt: '2026-12-01T00:00:00Z',
    };

    const result = toPublicSignup(decoded);

    expect(result).toEqual({
      character: 'Kholi Ruz',
      world: 'Gilgamesh',
      role: 'H1',
      progPoint: 'Enrage',
      partyStatus: 'Clear Party',
    });
    expect(Object.keys(result).sort()).toEqual([
      'character',
      'partyStatus',
      'progPoint',
      'role',
      'world',
    ]);
  });

  it('defaults missing progPoint and partyStatus to empty strings', () => {
    const result = toPublicSignup({
      character: 'Aeo',
      world: 'Cactuar',
      role: 'T1',
    });

    expect(result.progPoint).toBe('');
    expect(result.partyStatus).toBe('');
  });
});
