import { Test } from '@nestjs/testing';
import type { GuildMember } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoMock } from '../test-utils/mock-factory.js';
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

  const asMember = () => member as unknown as GuildMember;

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
