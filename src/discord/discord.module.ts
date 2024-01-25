import {
  Logger,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ActivityType, Client, Events } from 'discord.js';
import { first, firstValueFrom, fromEvent } from 'rxjs';
import { AppConfig } from '../app.config.js';
import { INTENTS, PARTIALS } from './discord.consts.js';
import { DISCORD_CLIENT, InjectDiscordClient } from './discord.decorators.js';
import { DiscordService } from './discord.service.js';

@Module({
  imports: [ConfigModule],
  providers: [
    DiscordService,
    {
      provide: DISCORD_CLIENT,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService<AppConfig, true>) => {
        const logger = new Logger(DISCORD_CLIENT);
        const client = new Client({ intents: INTENTS, partials: PARTIALS });
        const started$ = fromEvent(client, Events.ClientReady).pipe(first());

        client.once('error' as any, (error) => {
          logger.error(error);
        });

        client.login(configService.get('DISCORD_TOKEN'));

        await firstValueFrom(started$);
        return client;
      },
    },
  ],
  exports: [DISCORD_CLIENT, DiscordService],
})
class DiscordModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@InjectDiscordClient() private client: Client) {}

  onApplicationBootstrap() {
    this.client.user?.setActivity({
      type: ActivityType.Listening,
      name: 'to slashcommands!',
    });
  }

  onApplicationShutdown() {
    this.client.removeAllListeners();
  }
}

export { DiscordModule };
