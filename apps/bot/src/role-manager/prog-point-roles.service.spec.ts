import { Test } from '@nestjs/testing';
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

  describe('reconcileRole', () => {
    it('adds the desired role and removes other held candidates', () => {
      member.roles.cache.set('role-a', {});

      const changes = service.reconcileRole(
        asMember(),
        ['role-a', 'role-b', 'role-c'],
        'role-b',
      );

      expect(changes).toEqual({
        roleToAdd: 'role-b',
        rolesToRemove: ['role-a'],
      });
    });

    it('does not re-add a desired role the member already holds', () => {
      member.roles.cache.set('role-b', {});

      expect(
        service.reconcileRole(asMember(), ['role-a', 'role-b'], 'role-b'),
      ).toEqual({ rolesToRemove: [] });
    });

    it('never removes the desired role even when it is also another candidate', () => {
      member.roles.cache.set('role-shared', {});

      expect(
        service.reconcileRole(
          asMember(),
          ['role-shared', 'role-shared'],
          'role-shared',
        ),
      ).toEqual({ rolesToRemove: [] });
    });

    it('ignores undefined candidates', () => {
      member.roles.cache.set('role-a', {});

      const changes = service.reconcileRole(
        asMember(),
        [undefined, 'role-a', undefined],
        'role-b',
      );

      expect(changes).toEqual({
        roleToAdd: 'role-b',
        rolesToRemove: ['role-a'],
      });
    });

    it('leaves the member alone when there is no desired role', () => {
      member.roles.cache.set('role-a', {});

      expect(
        service.reconcileRole(asMember(), ['role-a', 'role-b'], undefined),
      ).toEqual({ rolesToRemove: [] });
    });

    it('strips held candidates when there is no desired role and pruneWhenNoDesired is set', () => {
      member.roles.cache.set('role-a', {});
      member.roles.cache.set('role-c', {});

      const changes = service.reconcileRole(
        asMember(),
        ['role-a', 'role-b', 'role-c'],
        undefined,
        { pruneWhenNoDesired: true },
      );

      expect(changes.roleToAdd).toBeUndefined();
      expect([...changes.rolesToRemove].sort()).toEqual(['role-a', 'role-c']);
    });
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

    it('returns empty changes for an unmapped prog point by default', () => {
      member.roles.cache.set('role-p1', {});

      expect(
        service.computeChanges(asMember(), { P1: 'role-p1' }, 'P9'),
      ).toEqual({ rolesToRemove: [] });
    });

    it('prunes held mapped roles for an unmapped prog point when pruneUnmapped is set', () => {
      member.roles.cache.set('role-p1', {});
      member.roles.cache.set('role-p3', {});

      const changes = service.computeChanges(
        asMember(),
        { P1: 'role-p1', P2: 'role-p2', P3: 'role-p3' },
        'P9',
        { pruneUnmapped: true },
      );

      expect(changes.roleToAdd).toBeUndefined();
      expect([...changes.rolesToRemove].sort()).toEqual(['role-p1', 'role-p3']);
    });

    it('prunes nothing for an unmapped prog point when the member holds no mapped role', () => {
      expect(
        service.computeChanges(asMember(), { P1: 'role-p1' }, 'P9', {
          pruneUnmapped: true,
        }),
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
});
