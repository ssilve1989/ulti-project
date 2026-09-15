import { Test } from '@nestjs/testing';
import { PartyStatus } from '@ulti-project/shared';
import type { GuildMember } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoMock, mockOf } from '../test-utils/mock-factory.js';
import { ProgPointRolesService } from './prog-point-roles.service.js';

describe('ProgPointRolesService', () => {
  let service: ProgPointRolesService;
  let member: {
    user: { username: string };
    roles: {
      cache: Map<string, unknown>;
      add: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  };

  const asMember = () => mockOf<GuildMember>(member);

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [ProgPointRolesService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(ProgPointRolesService);

    member = {
      user: { username: 'tester' },
      roles: {
        cache: new Map(),
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  describe('computeChanges', () => {
    it('returns empty changes when there is no mapping', () => {
      expect(service.computeChanges(asMember(), undefined, 'P2')).toEqual({
        rolesToRemove: [],
      });
    });

    it('returns empty changes when there is no prog point', () => {
      expect(
        service.computeChanges(asMember(), { P1: 'role-p1' }, undefined),
      ).toEqual({ rolesToRemove: [] });
    });

    it('returns empty changes for an unmapped prog point', () => {
      member.roles.cache.set('role-p1', {});

      expect(
        service.computeChanges(asMember(), { P1: 'role-p1' }, 'P9'),
      ).toEqual({ rolesToRemove: [] });
    });

    it('adds the mapped role and removes other held mapped roles', () => {
      member.roles.cache.set('role-p1', {});

      const changes = service.computeChanges(
        asMember(),
        { P1: 'role-p1', P2: 'role-p2', P3: 'role-p3' },
        'P2',
      );

      expect(changes).toEqual({
        roleToAdd: 'role-p2',
        rolesToRemove: ['role-p1'],
      });
    });

    it('never removes a role shared with the target prog point', () => {
      member.roles.cache.set('role-shared', {});

      const changes = service.computeChanges(
        asMember(),
        { P2a: 'role-shared', P2b: 'role-shared' },
        'P2b',
      );

      expect(changes).toEqual({ rolesToRemove: [] });
    });

    it('does not re-add a role the member already holds', () => {
      member.roles.cache.set('role-p2', {});

      const changes = service.computeChanges(
        asMember(),
        { P1: 'role-p1', P2: 'role-p2' },
        'P2',
      );

      expect(changes).toEqual({ rolesToRemove: [] });
    });

    it('does not list roles the member does not hold for removal', () => {
      const changes = service.computeChanges(
        asMember(),
        { P1: 'role-p1', P2: 'role-p2' },
        'P2',
      );

      expect(changes).toEqual({ roleToAdd: 'role-p2', rolesToRemove: [] });
    });

    it('removes every held mapped role for an unmapped prog point when pruneUnmapped is set', () => {
      member.roles.cache.set('role-p1', {});
      member.roles.cache.set('role-p2', {});

      expect(
        service.computeChanges(
          asMember(),
          { P1: 'role-p1', P2: 'role-p2', P3: 'role-p3' },
          'P9',
          { pruneUnmapped: true },
        ),
      ).toEqual({ rolesToRemove: ['role-p1', 'role-p2'] });
    });

    it('treats a mapped prog point the same when pruneUnmapped is set', () => {
      member.roles.cache.set('role-p1', {});

      expect(
        service.computeChanges(
          asMember(),
          { P1: 'role-p1', P2: 'role-p2' },
          'P2',
          { pruneUnmapped: true },
        ),
      ).toEqual({ roleToAdd: 'role-p2', rolesToRemove: ['role-p1'] });
    });
  });

  describe('applyChanges', () => {
    it('removes then adds roles', async () => {
      await service.applyChanges(asMember(), {
        roleToAdd: 'role-p2',
        rolesToRemove: ['role-p1'],
      });

      expect(member.roles.remove).toHaveBeenCalledWith(['role-p1']);
      expect(member.roles.add).toHaveBeenCalledWith('role-p2');
    });

    it('skips empty parts', async () => {
      await service.applyChanges(asMember(), { rolesToRemove: [] });

      expect(member.roles.remove).not.toHaveBeenCalled();
      expect(member.roles.add).not.toHaveBeenCalled();
    });
  });

  describe('computeCoarseRoleChanges', () => {
    const roles = { progRole: 'prog-role', clearRole: 'clear-role' };

    it.each([
      {
        case: 'swaps the clear role for the prog role when moving to Prog Party',
        held: ['clear-role'],
        partyStatus: PartyStatus.ProgParty,
        expected: { roleToAdd: 'prog-role', rolesToRemove: ['clear-role'] },
      },
      {
        case: 'swaps the prog role for the clear role when moving to Clear Party',
        held: ['prog-role'],
        partyStatus: PartyStatus.ClearParty,
        expected: { roleToAdd: 'clear-role', rolesToRemove: ['prog-role'] },
      },
      {
        case: 'maps Early Prog Party to the prog role',
        held: [],
        partyStatus: PartyStatus.EarlyProgParty,
        expected: { roleToAdd: 'prog-role', rolesToRemove: [] },
      },
      {
        case: 'changes nothing when the desired role is already held',
        held: ['prog-role'],
        partyStatus: PartyStatus.ProgParty,
        expected: { rolesToRemove: [] },
      },
      {
        case: 'keeps only the desired role when both are held',
        held: ['prog-role', 'clear-role'],
        partyStatus: PartyStatus.ClearParty,
        expected: { rolesToRemove: ['prog-role'] },
      },
    ])('$case', ({ held, partyStatus, expected }) => {
      for (const roleId of held) {
        member.roles.cache.set(roleId, {});
      }

      expect(
        service.computeCoarseRoleChanges(asMember(), roles, partyStatus),
      ).toEqual(expected);
    });

    it('strips a stale coarse role even when the desired role is not configured', () => {
      member.roles.cache.set('clear-role', {});

      expect(
        service.computeCoarseRoleChanges(
          asMember(),
          { clearRole: 'clear-role' },
          PartyStatus.ProgParty,
        ),
      ).toEqual({ rolesToRemove: ['clear-role'] });
    });
  });
});
