import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CronJob } from 'cron';
import { EmbedBuilder, Invite } from 'discord.js';
import { filter, from, lastValueFrom, mergeMap, reduce } from 'rxjs';
import { CronTime } from '../../common/cron.js';
import { inviteCleanerConfig } from '../../config/invite-cleaner.js';
import { DiscordService } from '../../discord/discord.service.js';
import { JobCollection } from '../../firebase/collections/job/job.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { createJob, jobDateFormatter } from '../jobs.consts.js';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

interface CleanupStats {
  totalInvites: number;
  cleanedInvites: number;
  failedCleanups: number;
}

@Injectable()
class InviteCleanerJob
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  protected job: CronJob<null, null>;
  private readonly logger = new Logger(InviteCleanerJob.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly jobsCollection: JobCollection,
    private readonly settingsCollection: SettingsCollection,
  ) {
    this.job = createJob('invite-cleaner', {
      cronTime: CronTime.everyDay().at(5), // Run at 5 AM Pacific
      onTick: () => {
        this.cleanInvites();
      },
    });
  }

  onApplicationBootstrap() {
    this.job.start();
    this.logger.log(
      `daily run scheduled for: ${jobDateFormatter.format(this.job.nextDate().toJSDate())}`,
    );
  }

  onApplicationShutdown() {
    this.job.stop();
  }

  private async cleanInvites() {
    this.logger.log('starting invite cleaner job');

    const guilds = this.discordService.getGuilds();
    const twoWeeksAgo = Date.now() - TWO_WEEKS_MS;

    const task$ = from(guilds).pipe(
      mergeMap((guild) =>
        this.jobsCollection
          .getJob(guild, 'invite-cleaner')
          .then((job) => [guild, job] as const),
      ),
      filter(([_, job]) => !!job?.enabled),
      mergeMap(async ([guildId]) => {
        const invites = await this.discordService.getGuildInvites(guildId);

        // Process deletions with concurrency control and collect stats
        const stats = await lastValueFrom(
          from(invites.values()).pipe(
            filter((invite): invite is Invite => {
              const timestamp = invite.createdTimestamp;
              return timestamp != null && timestamp < twoWeeksAgo;
            }),
            mergeMap(async (invite) => {
              this.logger.debug(
                `deleting old invite ${invite.code} from ${guildId}`,
              );
              try {
                await invite.delete();
                return { success: true };
              } catch (error: unknown) {
                this.logger.error(
                  `Failed to delete invite ${invite.code}:`,
                  error,
                );
                return { success: false };
              }
            }, inviteCleanerConfig.INVITE_CLEANER_CONCURRENCY),
            reduce<{ success: boolean }, CleanupStats>(
              (stats, result) => {
                if (result.success) {
                  stats.cleanedInvites++;
                } else {
                  stats.failedCleanups++;
                }
                return stats;
              },
              {
                totalInvites: invites.size,
                cleanedInvites: 0,
                failedCleanups: 0,
              },
            ),
          ),
        );

        // Log stats for this guild
        this.logger.log(
          `Guild ${guildId} cleanup summary:`,
          `${stats.cleanedInvites} invites cleaned up,`,
          `${stats.failedCleanups} failures,`,
          `out of ${stats.totalInvites} total invites`,
        );

        try {
          // Post summary to mod channel if configured
          await this.publishResults(stats, guildId);
        } catch (error: unknown) {
          this.logger.error(
            `Failed to publish results for guild ${guildId}:`,
            error,
          );
        }

        return stats;
      }),
    );

    await lastValueFrom(task$, { defaultValue: undefined });
    this.logger.log('Invite cleanup job complete');
  }

  private async publishResults(stats: CleanupStats, guildId: string) {
    if (stats.cleanedInvites === 0 && stats.failedCleanups === 0) return;

    const settings = await this.settingsCollection.getSettings(guildId);
    if (!settings?.autoModChannelId) return;

    const embed = new EmbedBuilder()
      .setTitle(':broom: Invite Cleanup :broom:')
      .setDescription(
        [
          `${stats.cleanedInvites} expired invites have been cleaned up!`,
          stats.failedCleanups > 0
            ? `${stats.failedCleanups} invites failed to be deleted.`
            : null,
          `Total invites in server: ${stats.totalInvites}`,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .setTimestamp();

    const channel = await this.discordService.getTextChannel({
      guildId,
      channelId: settings.autoModChannelId,
    });

    return await channel?.send({ embeds: [embed] });
  }
}

export { InviteCleanerJob };
