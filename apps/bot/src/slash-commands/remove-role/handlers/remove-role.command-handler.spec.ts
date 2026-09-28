import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, Role } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { createAutoMock, mockOf } from '../../../test-utils/mock-factory.js';
import { RemoveRoleCommandHandler } from './remove-role.command-handler.js';

describe('RemoveRoleCommandHandler', () => {
  let command: RemoveRoleCommandHandler;
  let discordService: DiscordService;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [RemoveRoleCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(RemoveRoleCommandHandler);
    discordService = fixture.get(DiscordService);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should report successful removals', async () => {
    vi.mocked(discordService.removeRole).mockResolvedValue({
      roleFound: true,
      totalMembers: 2,
      successCount: 2,
      failCount: 0,
    });
    const interaction = mockOf<ChatInputCommandInteraction<'cached'>>({
      guildId: 'guild-1',
      options: {
        getRole: vi.fn().mockReturnValue(mockOf<Role>({ id: 'role-1' })),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    });

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      'Success! Removed role from 2/2 members.',
    );
  });

  it('should report failed removals', async () => {
    vi.mocked(discordService.removeRole).mockResolvedValue({
      roleFound: true,
      totalMembers: 2,
      successCount: 1,
      failCount: 1,
    });
    const interaction = mockOf<ChatInputCommandInteraction<'cached'>>({
      guildId: 'guild-1',
      options: {
        getRole: vi.fn().mockReturnValue(mockOf<Role>({ id: 'role-1' })),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    });

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      'Role removal completed with failures.\nSuccessful removals: 1/2\nFailed removals: 1',
    );
  });

  it('should report when the role was not found', async () => {
    vi.mocked(discordService.removeRole).mockResolvedValue({
      roleFound: false,
      totalMembers: 0,
      successCount: 0,
      failCount: 0,
    });
    const interaction = mockOf<ChatInputCommandInteraction<'cached'>>({
      guildId: 'guild-1',
      options: {
        getRole: vi.fn().mockReturnValue(mockOf<Role>({ id: 'role-1' })),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    });

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      'Role was not found; no removals were attempted.',
    );
  });
});
