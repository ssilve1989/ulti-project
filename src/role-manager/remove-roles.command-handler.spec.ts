import { Test } from '@nestjs/testing';
import type { GuildMember } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../discord/discord.service.js';
import { Encounter } from '../encounters/encounters.consts.js';
import { SettingsCollection } from '../firebase/collections/settings-collection.js';
import { RemoveRolesCommand } from '../slash-commands/signup/commands/signup.commands.js';
import { createAutoMock } from '../test-utils/mock-factory.js';
import { RemoveRolesCommandHandler } from './remove-roles.command-handler.js';

describe('RemoveRolesCommandHandler', () => {
  let handler: RemoveRolesCommandHandler;
  let discordService: Mocked<DiscordService>;
  let settingsCollection: Mocked<SettingsCollection>;
  let member: {
    user: { username: string };
    roles: { remove: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [RemoveRolesCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(RemoveRolesCommandHandler);
    discordService = fixture.get(DiscordService);
    settingsCollection = fixture.get(SettingsCollection);

    member = {
      user: { username: 'tester' },
      roles: { remove: vi.fn().mockResolvedValue(undefined) },
    };

    discordService.getGuildMember.mockResolvedValue(
      member as unknown as GuildMember,
    );
  });

  it('removes clear, prog and mapped prog point roles, deduplicated', async () => {
    settingsCollection.getSettings.mockResolvedValue({
      clearRoles: { TOP: 'clear-role' },
      progRoles: { TOP: 'prog-role' },
      progPointRoles: {
        TOP: { P1: 'role-p1', P2: 'role-p2', P2b: 'role-p2' },
      },
    });

    await handler.execute(
      new RemoveRolesCommand('guild-1', 'user-1', Encounter.TOP),
    );

    expect(member.roles.remove).toHaveBeenCalledWith([
      'clear-role',
      'prog-role',
      'role-p1',
      'role-p2',
    ]);
  });

  it('does nothing when no roles are configured for the encounter', async () => {
    settingsCollection.getSettings.mockResolvedValue({});

    await handler.execute(
      new RemoveRolesCommand('guild-1', 'user-1', Encounter.TOP),
    );

    expect(member.roles.remove).not.toHaveBeenCalled();
  });
});
