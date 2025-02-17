import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignupCommandHandler } from '../signup.command-handler';
import { EventBus } from '@nestjs/cqrs';
import { SignupCollection } from '../../../../../firebase/collections/signup.collection';
import { SettingsCollection } from '../../../../../firebase/collections/settings-collection';
import { DiscordService } from '../../../../../discord/discord.service';
import { DiscordjsErrorCodes } from 'discord.js';

describe('SignupCommandHandler', () => {
  let handler: SignupCommandHandler;
  let eventBus: EventBus;
  let signupCollection: SignupCollection;
  let settingsCollection: SettingsCollection;
  let discordService: DiscordService;
  let mockInteraction: any;

  beforeEach(() => {
    eventBus = { publish: vi.fn() } as any;
    signupCollection = { findById: vi.fn(), upsert: vi.fn() } as any;
    settingsCollection = { getReviewChannel: vi.fn() } as any;
    discordService = { getDisplayName: vi.fn(), deleteMessage: vi.fn() } as any;

    mockInteraction = {
      user: { id: '123', username: 'testuser' },
      guildId: '456',
      deferReply: vi.fn(),
      reply: vi.fn(),
      editReply: vi.fn(),
      deferred: false,
      replied: false,
    };

    handler = new SignupCommandHandler(
      eventBus,
      signupCollection,
      settingsCollection,
      discordService
    );
  });

  it('should handle DiscordAPIError[10062] gracefully', async () => {
    // Arrange
    const deferError = new Error('Unknown interaction');
    deferError['code'] = DiscordjsErrorCodes.UnknownInteraction;
    mockInteraction.deferReply.mockRejectedValueOnce(deferError);
    settingsCollection.getReviewChannel.mockResolvedValue('789');

    // Act
    await handler.execute({ interaction: mockInteraction });

    // Assert
    expect(mockInteraction.deferReply).toHaveBeenCalledWith({
      flags: expect.any(Number)
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: 'Processing your request...',
      flags: expect.any(Number)
    });
  });

  it('should continue processing if interaction already acknowledged', async () => {
    // Arrange
    const alreadyRepliedError = new Error('Interaction already replied');
    alreadyRepliedError['code'] = DiscordjsErrorCodes.InteractionAlreadyReplied;
    mockInteraction.deferReply.mockRejectedValueOnce(alreadyRepliedError);
    mockInteraction.replied = true;

    // Act
    await handler.execute({ interaction: mockInteraction });

    // Assert
    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(mockInteraction.reply).not.toHaveBeenCalled();
  });
});