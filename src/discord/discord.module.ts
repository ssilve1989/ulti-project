import {
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { ActivityType, Client, Events, Options } from 'discord.js';
import { first, firstValueFrom, fromEvent } from 'rxjs';
import { appConfig } from '../config/app.js';
import { INTENTS, PARTIALS } from './discord.consts.js';
import { DISCORD_CLIENT, InjectDiscordClient } from './discord.decorators.js';
import { CacheTime } from './discord.helpers.js';
import { DiscordService } from './discord.service.js';

@Module({
  providers: [
    DiscordService,
    {
      provide: DISCORD_CLIENT,
      useFactory: async () => {
        const logger = new Logger(DISCORD_CLIENT);
        const client = new Client({
          intents: INTENTS,
          partials: PARTIALS,
          makeCache: Options.cacheWithLimits({
            ...Options.DefaultMakeCacheSettings,
            PresenceManager: 0,
            DMMessageManager: 0,
            GuildTextThreadManager: 0,
          }),
          sweepers: {
            ...Options.DefaultSweeperSettings,
            guildMembers: {
              interval: CacheTime(2, 'hours'),
              filter: () => (member) => member.id !== member.client.user.id,
            },
            messages: {
              // check for messages to sweep every 1 hours
              interval: CacheTime(2, 'hours'),
              // remove messages than are older than 12 hours
              lifetime: CacheTime(12, 'hours'),
            },
            reactions: {
              interval: CacheTime(2, 'hours'),
              // remove all reactions on sweep
              filter: () => () => true,
            },
            users: {
              interval: CacheTime(2, 'hours'),
              // remove all users that are not our own bot.
              filter: () => (user) => user.id !== user.client.user.id,
            },
          },
        });
        const started$ = fromEvent(client, Events.ClientReady).pipe(first());

        client.once('error', (error) => {
          Sentry.captureException(error);
          logger.error(error);
        });

        client.login(appConfig.DISCORD_TOKEN);

        await firstValueFrom(started$);
        return client;
      },
    },
  ],
  exports: [DISCORD_CLIENT, DiscordService],
})
class DiscordModule implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DiscordModule.name);

  constructor(@InjectDiscordClient() private client: Client) {}

  onApplicationBootstrap() {
    this.client.user?.setActivity({
      type: ActivityType.Listening,
      name: 'Slashcommands!',
    });

    fromEvent(this.client, Events.CacheSweep).subscribe({
      next: (msg) => this.logger.log(msg),
      error: (err) => {
        Sentry;
        this.logger.error(err);
      },
    });
  }

  onApplicationShutdown() {
    this.client.removeAllListeners();
  }
}

export { DiscordModule };
