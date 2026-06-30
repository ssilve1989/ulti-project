import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { CronJob } from 'cron';
import { DiscordService } from '../../discord/discord.service.js';
import { createJob, jobDateFormatter } from '../jobs.consts.js';
import { pickRandomStatus } from './bot-status.consts.js';

// '0 0 */6 * * *' = at second 0, minute 0, every 6th hour (00:00, 06:00, 12:00, 18:00)
const EVERY_SIX_HOURS = '0 0 */6 * * *';

@Injectable()
class BotStatusJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BotStatusJob.name);
  private readonly job: CronJob;

  constructor(private readonly discordService: DiscordService) {
    this.job = createJob('bot-status', {
      cronTime: EVERY_SIX_HOURS,
      onTick: () => this.rotateStatus(),
    });
  }

  onApplicationBootstrap() {
    this.rotateStatus();
    this.job.start();
    this.logger.log(
      `next status rotation scheduled for: ${jobDateFormatter.format(this.job.nextDate().toJSDate())}`,
    );
  }

  onApplicationShutdown() {
    this.job.stop();
  }

  private rotateStatus() {
    try {
      this.discordService.setActivity(pickRandomStatus());
    } catch (error: unknown) {
      Sentry.captureException(error);
      this.logger.error('bot-status job failed', error);
    }
  }
}

export { BotStatusJob };
