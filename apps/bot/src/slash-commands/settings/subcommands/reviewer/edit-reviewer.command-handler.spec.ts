import { Test } from '@nestjs/testing';
import type {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Role,
} from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock, mockOf } from '../../../../test-utils/mock-factory.js';
import { EditReviewerCommandHandler } from './edit-reviewer.command-handler.js';

describe('EditReviewerCommandHandler', () => {
  let command: EditReviewerCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditReviewerCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(EditReviewerCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    errorService = fixture.get(ErrorService);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should update reviewer role', async () => {
    const guildId = '12345';
    const roleId = '67890';

    const existingSettings = {
      reviewerRole: 'old-role',
    };

    settingsCollection.getSettings.mockResolvedValueOnce(existingSettings);

    await command.execute(
      mockOf<ChatInputCommandInteraction<'cached'>>({
        guildId,
        options: {
          getRole: (name: string, _required?: boolean) =>
            name === 'reviewer-role'
              ? mockOf<Role>({
                  id: roleId,
                  toString: () => `<@&${roleId}>`,
                })
              : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      }),
    );

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({
        reviewerRole: roleId,
      }),
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Test error');
    const mockErrorEmbed = mockOf<EmbedBuilder>({});

    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = mockOf<ChatInputCommandInteraction<'cached'>>({
      guildId: '12345',
      options: {
        getRole: (_: string, __?: boolean) =>
          mockOf<Role>({ id: '67890', toString: () => '<@&67890>' }),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    });

    await command.execute(interaction);

    expect(errorService.handleCommandError).toHaveBeenCalledWith(
      error,
      interaction,
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [mockErrorEmbed],
    });
  });
});
