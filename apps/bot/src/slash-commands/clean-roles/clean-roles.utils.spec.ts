import { describe, expect, it } from 'vitest';
import { memberWith, roleHeldBy } from './clean-roles.test-helpers.js';
import { planRoleRemovals } from './clean-roles.utils.js';

describe('planRoleRemovals', () => {
  describe('when the bot may remove a role', () => {
    it('keeps it for holders with an active signup, and marks the rest stale', () => {
      const active = memberWith('active');
      const lapsed = memberWith('lapsed');
      const role = roleHeldBy('r1', [active, lapsed]);

      expect(planRoleRemovals([role], new Set([active.id]))).toEqual([
        { role, kept: [active], stale: [lapsed], removable: true },
      ]);
    });
  });

  describe('when the bot may not remove a role', () => {
    it('marks it unremovable', () => {
      const active = memberWith('active');
      const lapsed = memberWith('lapsed');
      const role = roleHeldBy('r1', [active, lapsed], { editable: false });

      expect(planRoleRemovals([role], new Set([active.id]))).toEqual([
        { role, kept: [active], stale: [lapsed], removable: false },
      ]);
    });
  });
});
