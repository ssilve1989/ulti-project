import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import { EditChannelsCommandHandler } from './edit-channels.command-handler.js';

describe('Edit Channels Command Handler', () => {
  let handler: EditChannelsCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditChannelsCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(EditChannelsCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    errorService = fixture.get(ErrorService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should update channel settings', async () => {
    const guildId = '12345';
    const reviewChannelId = '67890';
    const signupChannelId = '09876';
    const autoModChannelId = '54321';

    const existingSettings = {
      reviewChannel: 'old-review',
      signupChannel: 'old-signup',
      autoModChannelId: 'old-mod',
    };

    settingsCollection.getSettings.mockResolvedValueOnce(existingSettings);

    await handler.execute({
      interaction: {
        guildId,
        options: {
          getChannel: (name: string) => {
            switch (name) {
              case 'signup-review-channel':
                return { id: reviewChannelId };
              case 'signup-public-channel':
                return { id: signupChannelId };
              case 'moderation-channel':
                return { id: autoModChannelId };
              default:
                return null;
            }
          },
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>,
    });

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({
        reviewChannel: reviewChannelId,
        signupChannel: signupChannelId,
        autoModChannelId: autoModChannelId,
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
        getChannel: () => ({ id: '67890' }),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

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
