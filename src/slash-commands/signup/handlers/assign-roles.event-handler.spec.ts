import { Test } from '@nestjs/testing';
import type { GuildMember, Message, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { Encounter } from '../../../encounters/encounters.consts.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  PartyStatus,
  type SignupDocument,
} from '../../../firebase/models/signup.model.js';
import { ProgPointRolesService } from '../../../role-manager/prog-point-roles.service.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { SignupApprovedEvent } from '../events/signup.events.js';
import { AssignRolesEventHandler } from './assign-roles.event-handler.js';

describe('AssignRolesEventHandler', () => {
  let handler: AssignRolesEventHandler;
  let discordService: Mocked<DiscordService>;
  let member: {
    user: { username: string };
    roles: {
      cache: Map<string, unknown>;
      add: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  };

  const guildId = 'guild-1';

  const createEvent = (
    signup: Partial<SignupDocument>,
    settings: SettingsDocument,
  ) =>
    new SignupApprovedEvent(
      {
        discordId: 'user-1',
        encounter: Encounter.TOP,
        ...signup,
      } as SignupDocument,
      settings,
      {} as User,
      { guildId } as Message<true>,
    );

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [AssignRolesEventHandler, ProgPointRolesService],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(AssignRolesEventHandler);
    discordService = fixture.get(DiscordService);

    member = {
      user: { username: 'tester' },
      roles: {
        cache: new Map(),
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    };

    discordService.getGuildMember.mockResolvedValue(
      member as unknown as GuildMember,
    );
  });

  it('adds the prog role for prog party status (existing behavior)', async () => {
    await handler.handle(
      createEvent(
        { partyStatus: PartyStatus.ProgParty, progPoint: 'P2' },
        { progRoles: { TOP: 'prog-role' } },
      ),
    );

    expect(member.roles.add).toHaveBeenCalledWith('prog-role');
  });

  it('swaps prog role for clear role on clear party status (existing behavior)', async () => {
    await handler.handle(
      createEvent(
        { partyStatus: PartyStatus.ClearParty, progPoint: 'P4' },
        { progRoles: { TOP: 'prog-role' }, clearRoles: { TOP: 'clear-role' } },
      ),
    );

    expect(member.roles.remove).toHaveBeenCalledWith('prog-role');
    expect(member.roles.add).toHaveBeenCalledWith('clear-role');
  });

  it('adds the mapped prog point role and removes other held mapped roles', async () => {
    member.roles.cache.set('role-p1', {});

    await handler.handle(
      createEvent(
        { partyStatus: PartyStatus.ProgParty, progPoint: 'P2' },
        {
          progPointRoles: {
            TOP: { P1: 'role-p1', P2: 'role-p2', P3: 'role-p3' },
          },
        },
      ),
    );

    expect(member.roles.remove).toHaveBeenCalledWith(['role-p1']);
    expect(member.roles.add).toHaveBeenCalledWith('role-p2');
  });

  it('does not remove a shared role when progressing within the same phase', async () => {
    member.roles.cache.set('role-shared', {});

    await handler.handle(
      createEvent(
        { partyStatus: PartyStatus.ProgParty, progPoint: 'P2b' },
        {
          progPointRoles: {
            TOP: { P2a: 'role-shared', P2b: 'role-shared' },
          },
        },
      ),
    );

    expect(member.roles.remove).not.toHaveBeenCalled();
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('is a no-op for an unmapped prog point', async () => {
    member.roles.cache.set('role-p1', {});

    await handler.handle(
      createEvent(
        { partyStatus: PartyStatus.ProgParty, progPoint: 'P9' },
        { progPointRoles: { TOP: { P1: 'role-p1' } } },
      ),
    );

    expect(member.roles.remove).not.toHaveBeenCalled();
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('is a no-op when no mapping exists for the encounter', async () => {
    await handler.handle(
      createEvent(
        { partyStatus: PartyStatus.ProgParty, progPoint: 'P2' },
        { progPointRoles: { UWU: { P1: 'role-p1' } } },
      ),
    );

    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('does not touch prog point roles for cleared status', async () => {
    await handler.handle(
      createEvent(
        { partyStatus: PartyStatus.Cleared, progPoint: PartyStatus.Cleared },
        { progPointRoles: { TOP: { P1: 'role-p1' } } },
      ),
    );

    expect(member.roles.add).not.toHaveBeenCalled();
    expect(member.roles.remove).not.toHaveBeenCalled();
  });
});
