import { Test } from '@nestjs/testing';
import type {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Role,
} from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
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

    await command.execute({
      guildId,
      options: {
        getRole: (name: string, _required?: boolean) =>
          name === 'reviewer-role'
            ? ({
                id: roleId,
                toString: () => `<@&${roleId}>`,
              } as unknown as Role)
            : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>);

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({
        reviewerRole: roleId,
      }),
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Test error');
    const mockErrorEmbed = {} as EmbedBuilder;

    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = {
      guildId: '12345',
      options: {
        getRole: (_: string, __?: boolean) =>
          ({ id: '67890', toString: () => '<@&67890>' }) as unknown as Role,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

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
