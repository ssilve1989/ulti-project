import type { GuildMember, Role } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { mockOf } from '../../test-utils/mock-factory.js';
import { planRoleRemovals } from './clean-roles.utils.js';

const memberWith = (id: string) => mockOf<GuildMember>({ id });

const roleHeldBy = (
  id: string,
  members: GuildMember[],
  { editable = true }: { editable?: boolean } = {},
) =>
  mockOf<Role>({
    id,
    editable,
    members: new Map(members.map((member) => [member.id, member])),
  });

describe('planRoleRemovals', () => {
  describe('when the bot may remove a role', () => {
    it('keeps it for holders with an active signup, and removes it from the rest', () => {
      const active = memberWith('active');
      const lapsed = memberWith('lapsed');
      const role = roleHeldBy('r1', [active, lapsed]);

      expect(planRoleRemovals([role], new Set([active.id]))).toEqual([
        { role, kept: [active], toRemove: [lapsed], unremovable: [] },
      ]);
    });
  });

  describe('when the bot may not remove a role', () => {
    it('keeps it for holders with an active signup, and marks the rest unremovable', () => {
      const active = memberWith('active');
      const lapsed = memberWith('lapsed');
      const role = roleHeldBy('r1', [active, lapsed], { editable: false });

      expect(planRoleRemovals([role], new Set([active.id]))).toEqual([
        { role, kept: [active], toRemove: [], unremovable: [lapsed] },
      ]);
    });
  });
});
