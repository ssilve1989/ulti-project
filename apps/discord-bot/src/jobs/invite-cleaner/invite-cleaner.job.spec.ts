import { Test } from '@nestjs/testing';
import { Collection, Invite } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { JobCollection } from '../../firebase/collections/job/job.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { inviteCleanerConfig } from './invite-cleaner.config.js';
import { InviteCleanerJob } from './invite-cleaner.job.js';

describe('InviteCleanerJob', () => {
  let job: InviteCleanerJob;
  let discordService: DiscordService;
  let jobCollection: JobCollection;
  let settingsCollection: SettingsCollection;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        InviteCleanerJob,
        {
          provide: DiscordService,
          useValue: {
            getGuilds: vi.fn(),
            getGuildInvites: vi.fn(),
            getTextChannel: vi.fn(),
          },
        },
        {
          provide: JobCollection,
          useValue: {
            getJob: vi.fn(),
          },
        },
        {
          provide: SettingsCollection,
          useValue: {
            getSettings: vi.fn(),
          },
        },
        {
          provide: inviteCleanerConfig.KEY,
          useValue: {
            INVITE_CLEANER_CONCURRENCY: 5,
          },
        },
      ],
    }).compile();

    job = module.get(InviteCleanerJob);
    discordService = module.get(DiscordService);
    jobCollection = module.get(JobCollection);
    settingsCollection = module.get(SettingsCollection);
  });

  describe('cleanInvites', () => {
    const mockGuildId = '123';
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    beforeEach(() => {
      vi.spyOn(discordService, 'getGuilds').mockReturnValue([mockGuildId]);
      vi.spyOn(jobCollection, 'getJob').mockResolvedValue({ enabled: true });
      vi.spyOn(settingsCollection, 'getSettings').mockResolvedValue({
        modChannelId: 'mod-channel',
      });
      vi.spyOn(discordService, 'getTextChannel').mockResolvedValue({
        send: vi.fn().mockResolvedValue(undefined),
      } as any);
    });

    it('should delete invites older than 2 weeks', async () => {
      // Create mock invites
      const oldInvite = {
        createdTimestamp: twoWeeksAgo - 1000, // Older than 2 weeks
        code: 'old-invite',
        delete: vi.fn().mockResolvedValue(undefined),
      } as unknown as Invite;

      const newInvite = {
        createdTimestamp: Date.now(), // Fresh invite
        code: 'new-invite',
        delete: vi.fn().mockResolvedValue(undefined),
      } as unknown as Invite;

      // Create mock collection
      const invites = new Collection<string, Invite>();
      invites.set(oldInvite.code, oldInvite);
      invites.set(newInvite.code, newInvite);

      vi.spyOn(discordService, 'getGuildInvites').mockResolvedValue(invites);

      // Run the job
      await job['cleanInvites']();

      // Verify old invite was deleted and new invite was kept
      expect(oldInvite.delete).toHaveBeenCalled();
      expect(newInvite.delete).not.toHaveBeenCalled();
    });

    it('should handle failed deletions gracefully', async () => {
      // Create mock invite that will fail to delete
      const oldInvite = {
        createdTimestamp: twoWeeksAgo - 1000,
        code: 'old-invite',
        delete: vi.fn().mockRejectedValue(new Error('Delete failed')),
      } as unknown as Invite;

      // Create mock collection
      const invites = new Collection<string, Invite>();
      invites.set(oldInvite.code, oldInvite);

      vi.spyOn(discordService, 'getGuildInvites').mockResolvedValue(invites);

      // Run the job - should not throw
      await expect(job['cleanInvites']()).resolves.not.toThrow();
    });

    it('should skip guilds where job is disabled', async () => {
      vi.spyOn(jobCollection, 'getJob').mockResolvedValue({ enabled: false });

      // Run the job
      await job['cleanInvites']();

      // Verify guild invites were not fetched
      expect(discordService.getGuildInvites).not.toHaveBeenCalled();
    });

    it('should handle guilds with no invites', async () => {
      // Create empty collection
      const invites = new Collection<string, Invite>();
      vi.spyOn(discordService, 'getGuildInvites').mockResolvedValue(invites);

      // Run the job - should not throw
      await expect(job['cleanInvites']()).resolves.not.toThrow();
    });
  });
});
