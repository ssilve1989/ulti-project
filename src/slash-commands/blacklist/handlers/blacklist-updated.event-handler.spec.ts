import { Test } from '@nestjs/testing';
import type { User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { BlacklistUpdatedEvent } from '../events/blacklist.events.js';
import { BlacklistUpdatedEventHandler } from './blacklist-updated.event-handler.js';

describe('BlacklistUpdatedEventHandler', () => {
  let handler: BlacklistUpdatedEventHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let discordService: Mocked<DiscordService>;

  const guildId = 'guild-1';
  const triggeredBy = {
    id: 'mod-1',
    displayAvatarURL: () => 'https://cdn.example/avatar.png',
  } as unknown as User;

  const event = new BlacklistUpdatedEvent({
    guildId,
    type: 'added',
    triggeredBy,
    entry: {
      discordId: 'user-1',
      characterName: 'test character',
      reason: 'botting',
      lodestoneId: 12345,
    },
  });

  function mockChannel() {
    return { send: vi.fn().mockResolvedValue(undefined) };
  }

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [BlacklistUpdatedEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(BlacklistUpdatedEventHandler);
    settingsCollection = fixture.get(SettingsCollection);
    discordService = fixture.get(DiscordService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('does nothing when no blacklist channels are configured', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce(undefined);

    await handler.handle(event);

    expect(discordService.getTextChannel).not.toHaveBeenCalled();
  });

  it('does nothing when the channel list was explicitly emptied', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({
      blacklistChannelIds: [],
      autoModChannelId: 'automod-chan',
    });

    await handler.handle(event);

    expect(discordService.getTextChannel).not.toHaveBeenCalled();
  });

  it('sends the update embed to every configured channel', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({
      blacklistChannelIds: ['chan-1', 'chan-2'],
    });

    const channel1 = mockChannel();
    const channel2 = mockChannel();
    discordService.getTextChannel
      .mockResolvedValueOnce(channel1 as never)
      .mockResolvedValueOnce(channel2 as never);

    await handler.handle(event);

    expect(discordService.getTextChannel).toHaveBeenCalledWith({
      guildId,
      channelId: 'chan-1',
    });
    expect(discordService.getTextChannel).toHaveBeenCalledWith({
      guildId,
      channelId: 'chan-2',
    });
    expect(channel1.send).toHaveBeenCalledTimes(1);
    expect(channel2.send).toHaveBeenCalledTimes(1);
  });

  it('falls back to the auto-mod channel when no list is configured', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({
      autoModChannelId: 'automod-chan',
    });

    const channel = mockChannel();
    discordService.getTextChannel.mockResolvedValueOnce(channel as never);

    await handler.handle(event);

    expect(discordService.getTextChannel).toHaveBeenCalledWith({
      guildId,
      channelId: 'automod-chan',
    });
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('still notifies the remaining channels when one send fails', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({
      blacklistChannelIds: ['broken-chan', 'chan-2'],
    });

    const brokenChannel = {
      send: vi.fn().mockRejectedValue(new Error('Missing Permissions')),
    };
    const channel2 = mockChannel();
    discordService.getTextChannel
      .mockResolvedValueOnce(brokenChannel as never)
      .mockResolvedValueOnce(channel2 as never);

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(channel2.send).toHaveBeenCalledTimes(1);
  });
});
