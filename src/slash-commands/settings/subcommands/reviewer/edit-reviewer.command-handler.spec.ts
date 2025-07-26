import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, EmbedBuilder, Role } from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditReviewerCommandHandler } from './edit-reviewer.command-handler.js';

describe('Edit Reviewer Command Handler', () => {
  let handler: EditReviewerCommandHandler;
  let settingsCollection: DeepMocked<SettingsCollection>;
  let errorService: DeepMocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditReviewerCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(EditReviewerCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    errorService = fixture.get(ErrorService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should update reviewer role', async () => {
    const guildId = '12345';
    const roleId = '67890';

    const existingSettings = {
      reviewerRole: 'old-role',
    };

    settingsCollection.getSettings.mockResolvedValueOnce(existingSettings);

    await handler.execute({
      interaction: createMock<ChatInputCommandInteraction<'raw' | 'cached'>>({
        guildId,
        options: {
          getRole: (name: string, _required?: boolean) =>
            name === 'reviewer-role'
              ? createMock<Role>({
                  id: roleId,
                  toString: () => `<@&${roleId}>`,
                  valueOf: () => '',
                })
              : null,
        },
        valueOf: () => '',
      }),
    });

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({
        reviewerRole: roleId,
      }),
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Test error');
    const mockErrorEmbed = createMock<EmbedBuilder>();

    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = createMock<
      ChatInputCommandInteraction<'raw' | 'cached'>
    >({
      guildId: '12345',
      options: {
        getRole: (_: string, __?: boolean) =>
          createMock<Role>({
            id: '67890',
            toString: () => '<@&67890>',
            valueOf: () => '',
          }),
      },
      valueOf: () => '',
    });

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
