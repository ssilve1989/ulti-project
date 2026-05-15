import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import { EditAbsenceChannelCommandHandler } from './edit-absence-channel.command-handler.js';

describe('Edit Absence Channel Command Handler', () => {
  let handler: EditAbsenceChannelCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditAbsenceChannelCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(EditAbsenceChannelCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    errorService = fixture.get(ErrorService);
  });

  it('should store the absence notification channel id while preserving existing settings fields', async () => {
    const interaction = {
      guildId: 'guild-id',
      options: {
        getChannel: (name: string, _required?: boolean) =>
          name === 'absence-channel' ? { id: 'absence-channel-id' } : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    settingsCollection.getSettings.mockResolvedValueOnce({
      coordinatorRole: 'coordinator-role-id',
    });

    await handler.execute({ interaction });

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      'guild-id',
      expect.objectContaining({
        coordinatorRole: 'coordinator-role-id',
        absenceNotificationChannelId: 'absence-channel-id',
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Absence notification channel updated!',
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Test error');
    const mockErrorEmbed = {} as EmbedBuilder;
    const interaction = {
      guildId: 'guild-id',
      options: {
        getChannel: (_name: string, _required?: boolean) => ({
          id: 'absence-channel-id',
        }),
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
