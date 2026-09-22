import type { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CronJob } from 'cron';
import { Collection, type Invite } from 'discord.js';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { JobCollection } from '../../firebase/collections/job/job.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { runTick, settledState } from '../../test-utils/cron-tick.js';
import { mockOf, withInternals } from '../../test-utils/mock-factory.js';
import { InviteCleanerJob } from './invite-cleaner.job.js';

describe('InviteCleanerJob', () => {
  let job: InviteCleanerJob;
  let discordService: DiscordService;
  let jobCollection: JobCollection;
  let settingsCollection: SettingsCollection;
  let cronFrom: MockInstance<typeof CronJob.from>;

  beforeEach(async () => {
    // Pass-through spy: captures the (Sentry-wrapped) onTick cron will run.
    cronFrom = vi.spyOn(CronJob, 'from');

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
      ],
    }).compile();

    job = module.get(InviteCleanerJob);
    discordService = module.get(DiscordService);
    jobCollection = module.get(JobCollection);
    settingsCollection = module.get(SettingsCollection);
  });

  afterEach(() => {
    cronFrom.mockRestore();
  });

  describe('scheduled tick', () => {
    type Internals = {
      cleanInvites: () => Promise<void>;
      logger: Logger;
    };

    it('keeps the tick pending until the run settles', async () => {
      const run = Promise.withResolvers<void>();
      vi.spyOn(withInternals<Internals>(job), 'cleanInvites').mockReturnValue(
        run.promise,
      );

      const tick = runTick(cronFrom);

      expect(await settledState(tick)).toBe('pending');
      run.resolve();
      await expect(tick).resolves.toBeUndefined();
    });

    it('rejects the tick so the cron monitor records a failed run, and still logs it', async () => {
      const error = new Error('run failed');
      const internals = withInternals<Internals>(job);
      vi.spyOn(internals, 'cleanInvites').mockRejectedValue(error);
      const logError = vi
        .spyOn(internals.logger, 'error')
        .mockImplementation(() => undefined);

      await expect(runTick(cronFrom)).rejects.toBe(error);
      expect(logError).toHaveBeenCalledWith(error, 'invite-cleaner job failed');
    });
  });

  describe('cleanInvites', () => {
    const mockGuildId = '123';
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    beforeEach(() => {
      vi.spyOn(discordService, 'getGuilds').mockReturnValue([mockGuildId]);
      vi.spyOn(jobCollection, 'getJob').mockResolvedValue({ enabled: true });
      vi.spyOn(settingsCollection, 'getSettings').mockResolvedValue({
        autoModChannelId: 'mod-channel',
      });
      vi.spyOn(discordService, 'getTextChannel').mockResolvedValue(
        mockOf<
          NonNullable<Awaited<ReturnType<DiscordService['getTextChannel']>>>
        >({ send: vi.fn().mockResolvedValue(undefined) }),
      );
    });

    it('should delete invites older than 2 weeks', async () => {
      // Create mock invites
      const oldInvite = mockOf<Invite>({
        createdTimestamp: twoWeeksAgo - 1000, // Older than 2 weeks
        code: 'old-invite',
        delete: vi.fn().mockResolvedValue(undefined),
      });

      const newInvite = mockOf<Invite>({
        createdTimestamp: Date.now(), // Fresh invite
        code: 'new-invite',
        delete: vi.fn().mockResolvedValue(undefined),
      });

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
      const oldInvite = mockOf<Invite>({
        createdTimestamp: twoWeeksAgo - 1000,
        code: 'old-invite',
        delete: vi.fn().mockRejectedValue(new Error('Delete failed')),
      });

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
