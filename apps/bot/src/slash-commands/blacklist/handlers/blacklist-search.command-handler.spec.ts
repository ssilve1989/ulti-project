import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { BlacklistCollection } from '../../../firebase/collections/blacklist-collection.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import type { BlacklistDocument } from '../../../firebase/models/blacklist.model.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { BlacklistSearchCommand } from '../blacklist.commands.js';
import { BlacklistSearchCommandHandler } from './blacklist-search.command-handler.js';

describe('BlacklistSearchCommandHandler', () => {
  let handler: BlacklistSearchCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let blacklistCollection: Mocked<BlacklistCollection>;
  let discordService: Mocked<DiscordService>;

  const guildId = 'guild-1';
  const command = new BlacklistSearchCommand(
    {
      discordId: 'user-1',
      character: 'Test Character',
      reviewMessageId: 'msg-1',
    },
    guildId,
  );

  const match: BlacklistDocument = {
    discordId: 'user-1',
    characterName: 'test character',
    reason: 'botting',
    lodestoneId: null,
  };

  function mockChannel() {
    return { send: vi.fn().mockResolvedValue(undefined) };
  }

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [BlacklistSearchCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(BlacklistSearchCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    blacklistCollection = fixture.get(BlacklistCollection);
    discordService = fixture.get(DiscordService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('does not search when no blacklist channels are configured', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce(undefined);

    await handler.execute(command);

    expect(blacklistCollection.search).not.toHaveBeenCalled();
  });

  it('does not search when the channel list was explicitly emptied', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({
      blacklistChannelIds: [],
      autoModChannelId: 'automod-chan',
    });

    await handler.execute(command);

    expect(blacklistCollection.search).not.toHaveBeenCalled();
  });

  it('sends the detection embed to every configured channel', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({
      blacklistChannelIds: ['chan-1', 'chan-2'],
    });
    blacklistCollection.search.mockResolvedValueOnce(match);

    const channel1 = mockChannel();
    const channel2 = mockChannel();
    discordService.getTextChannel
      .mockResolvedValueOnce(channel1 as never)
      .mockResolvedValueOnce(channel2 as never);

    await handler.execute(command);

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
    blacklistCollection.search.mockResolvedValueOnce(match);

    const channel = mockChannel();
    discordService.getTextChannel.mockResolvedValueOnce(channel as never);

    await handler.execute(command);

    expect(discordService.getTextChannel).toHaveBeenCalledWith({
      guildId,
      channelId: 'automod-chan',
    });
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('does not send anything when the signup is not blacklisted', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({
      blacklistChannelIds: ['chan-1'],
    });
    blacklistCollection.search.mockResolvedValueOnce(undefined);

    await handler.execute(command);

    expect(discordService.getTextChannel).not.toHaveBeenCalled();
  });

  it('still notifies the remaining channels when one channel fails', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({
      blacklistChannelIds: ['broken-chan', 'chan-2'],
    });
    blacklistCollection.search.mockResolvedValueOnce(match);

    const channel2 = mockChannel();
    discordService.getTextChannel
      .mockRejectedValueOnce(new Error('Missing Access'))
      .mockResolvedValueOnce(channel2 as never);

    await expect(handler.execute(command)).resolves.toBeUndefined();
    expect(channel2.send).toHaveBeenCalledTimes(1);
  });
});
