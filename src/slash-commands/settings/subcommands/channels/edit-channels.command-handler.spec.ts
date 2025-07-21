import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditChannelsCommandHandler } from './edit-channels.command-handler.js';

describe('Edit Channels Command Handler', () => {
  let handler: EditChannelsCommandHandler;
  let settingsCollection: DeepMocked<SettingsCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditChannelsCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(EditChannelsCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
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
      interaction: createMock<ChatInputCommandInteraction<'raw' | 'cached'>>({
        guildId,
        options: {
          getChannel: (name: string) => {
            switch (name) {
              case 'signup-review-channel':
                return createMock({ id: reviewChannelId });
              case 'signup-public-channel':
                return createMock({ id: signupChannelId });
              case 'moderation-channel':
                return createMock({ id: autoModChannelId });
              default:
                return null;
            }
          },
        },
        valueOf: () => '',
      }),
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
    settingsCollection.getSettings.mockRejectedValueOnce(error);

    const interaction = createMock<
      ChatInputCommandInteraction<'raw' | 'cached'>
    >({
      guildId: '12345',
      options: {
        getChannel: () => createMock({ id: '67890' }),
      },
      valueOf: () => '',
    });

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith('Something went wrong!');
  });
});
