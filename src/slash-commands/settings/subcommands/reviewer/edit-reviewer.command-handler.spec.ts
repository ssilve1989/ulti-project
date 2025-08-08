import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, EmbedBuilder, Role } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditReviewerCommandHandler } from './edit-reviewer.command-handler.js';

describe('Edit Reviewer Command Handler', () => {
  let handler: EditReviewerCommandHandler;
  let settingsCollection: any;
  let errorService: any;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditReviewerCommandHandler],
    })
      .useMocker((token) => {
        if (typeof token === 'function') {
          const mockValue = vi.fn();
          const proto = token.prototype;
          if (proto) {
            Object.getOwnPropertyNames(proto).forEach(key => {
              if (key !== 'constructor') {
                mockValue[key] = vi.fn();
              }
            });
          }
          return mockValue;
        }
        return {};
      })
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
      interaction: {
        guildId,
        options: {
          getRole: (name: string, _required?: boolean) =>
            name === 'reviewer-role'
              ? {
                  id: roleId,
                  toString: () => `<@&${roleId}>`,
                  valueOf: () => '',
                }
              : null,
        },
        valueOf: () => '',
        editReply: vi.fn(),
        deferReply: vi.fn(),
      } as any,
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
    const mockErrorEmbed = {
      data: {},
      addFields: vi.fn(),
      setTitle: vi.fn(),
      setDescription: vi.fn(),
      setColor: vi.fn(),
      setFooter: vi.fn(),
      setTimestamp: vi.fn(),
    } as any;

    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = {
      guildId: '12345',
      options: {
        getRole: (_: string, __?: boolean) => ({
          id: '67890',
          toString: () => '<@&67890>',
          valueOf: () => '',
        }),
      },
      valueOf: () => '',
      editReply: vi.fn(),
      deferReply: vi.fn(),
    } as any;

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
