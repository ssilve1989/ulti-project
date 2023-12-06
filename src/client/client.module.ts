import {
  Logger,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Client, Events } from 'discord.js';
import { first, firstValueFrom, fromEvent } from 'rxjs';
import { DISCORD_CLIENT, InjectDiscordClient } from './client.decorators.js';
import { INTENTS } from './client.intents.js';
import { AppConfig } from '../app.config.js';
import { ClientsService } from './clients.service.js';

@Module({
  imports: [ConfigModule],
  providers: [
    ClientsService,
    {
      provide: DISCORD_CLIENT,
      useFactory: () => new Client({ intents: INTENTS }),
    },
  ],
  exports: [DISCORD_CLIENT, ClientsService],
})
class ClientModule implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger();
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    @InjectDiscordClient() private client: Client,
  ) {}

  async onApplicationBootstrap() {
    const started$ = fromEvent(this.client, Events.ClientReady).pipe(first());

    this.client.on('error' as any, (error) => {
      this.logger.error(error);
    });

    this.client.login(this.configService.get('DISCORD_TOKEN'));

    return firstValueFrom(started$);
  }

  onApplicationShutdown() {
    this.client.removeAllListeners();
  }
}

export { ClientModule };
