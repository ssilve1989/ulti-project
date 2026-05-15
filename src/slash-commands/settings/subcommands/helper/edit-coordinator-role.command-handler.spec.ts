import { Test } from '@nestjs/testing';
import type {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Role,
} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import { EditCoordinatorRoleCommandHandler } from './edit-coordinator-role.command-handler.js';

describe('Edit Coordinator Role Command Handler', () => {
  let handler: EditCoordinatorRoleCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditCoordinatorRoleCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(EditCoordinatorRoleCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    errorService = fixture.get(ErrorService);
  });

  it('should store the coordinator role id while preserving existing settings fields', async () => {
    const interaction = {
      guildId: 'guild-id',
      options: {
        getRole: (name: string, _required?: boolean) =>
          name === 'coordinator-role'
            ? ({
                id: 'coordinator-role-id',
                name: 'Coordinator',
              } as unknown as Role)
            : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    settingsCollection.getSettings.mockResolvedValueOnce({
      reviewerRole: 'reviewer-role',
    });

    await handler.execute({ interaction });

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      'guild-id',
      expect.objectContaining({
        reviewerRole: 'reviewer-role',
        coordinatorRole: 'coordinator-role-id',
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Coordinator role updated!',
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Test error');
    const mockErrorEmbed = {} as EmbedBuilder;
    const interaction = {
      guildId: 'guild-id',
      options: {
        getRole: (_name: string, _required?: boolean) =>
          ({
            id: 'coordinator-role-id',
            name: 'Coordinator',
          }) as unknown as Role,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    await handler.execute({ interaction });

    expect(errorService.handleCommandError).toHaveBeenCalledWith(
      error,
      interaction,
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [mockErrorEmbed],
    });
  });
});
