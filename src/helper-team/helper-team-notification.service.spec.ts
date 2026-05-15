import { Test } from '@nestjs/testing';
import type { TextChannel } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../discord/discord.service.js';
import { SettingsCollection } from '../firebase/collections/settings-collection.js';
import { createAutoMock } from '../test-utils/mock-factory.js';
import { HelperTeamNotificationService } from './helper-team-notification.service.js';

describe('HelperTeamNotificationService', () => {
  let service: HelperTeamNotificationService;
  let settingsCollection: Mocked<SettingsCollection>;
  let discordService: Mocked<DiscordService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [HelperTeamNotificationService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(HelperTeamNotificationService);
    settingsCollection = fixture.get(SettingsCollection);
    discordService = fixture.get(DiscordService);
  });

  describe('sendSessionAbsenceNotification', () => {
    it('sends a notification embed when settings and channel are configured', async () => {
      settingsCollection.getSettings.mockResolvedValueOnce({
        absenceNotificationChannelId: 'absence-channel-id',
      });

      const channel = {
        send: vi.fn().mockResolvedValue({}),
      } as unknown as TextChannel;
      discordService.getTextChannel.mockResolvedValueOnce(channel);

      const result = await service.sendSessionAbsenceNotification({
        guildId: 'guild-id',
        helperUserId: 'helper-id',
        teamName: 'Alpha',
        occurrenceUnixSeconds: 1767225600,
        reason: 'Work conflict',
      });

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
      expect(result).toEqual({ sent: true });
    });

    it('returns missing-channel-setting when no channel is configured', async () => {
      settingsCollection.getSettings.mockResolvedValueOnce({});

      const result = await service.sendSessionAbsenceNotification({
        guildId: 'guild-id',
        helperUserId: 'helper-id',
        teamName: 'Alpha',
        occurrenceUnixSeconds: 1767225600,
      });

      expect(result).toEqual({
        sent: false,
        reason: 'missing-channel-setting',
      });
    });

    it('returns channel-not-found when channel cannot be fetched', async () => {
      settingsCollection.getSettings.mockResolvedValueOnce({
        absenceNotificationChannelId: 'absence-channel-id',
      });
      discordService.getTextChannel.mockResolvedValueOnce(null);

      const result = await service.sendSessionAbsenceNotification({
        guildId: 'guild-id',
        helperUserId: 'helper-id',
        teamName: 'Alpha',
        occurrenceUnixSeconds: 1767225600,
      });

      expect(result).toEqual({ sent: false, reason: 'channel-not-found' });
    });
  });

  describe('sendRangeAbsenceNotification', () => {
    it('returns missing-channel-setting when no channel is configured', async () => {
      settingsCollection.getSettings.mockResolvedValueOnce({});

      const result = await service.sendRangeAbsenceNotification({
        guildId: 'guild-id',
        helperUserId: 'helper-id',
        startDate: '2026-05-20',
        endDate: '2026-05-27',
      });

      expect(result).toEqual({
        sent: false,
        reason: 'missing-channel-setting',
      });
    });
  });

  describe('sendAbsenceRemovedNotification', () => {
    it('sends a removal notification', async () => {
      settingsCollection.getSettings.mockResolvedValueOnce({
        absenceNotificationChannelId: 'absence-channel-id',
      });

      const channel = {
        send: vi.fn().mockResolvedValue({}),
      } as unknown as TextChannel;
      discordService.getTextChannel.mockResolvedValueOnce(channel);

      const result = await service.sendAbsenceRemovedNotification({
        guildId: 'guild-id',
        helperUserId: 'helper-id',
        description: 'Alpha team — Friday session',
      });

      expect(channel.send).toHaveBeenCalled();
      expect(result).toEqual({ sent: true });
    });
  });
});
