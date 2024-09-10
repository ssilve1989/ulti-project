import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import type { AppConfig } from '../app.config.js';
import { DiscordModule } from '../discord/discord.module.js';
import { SlashCommandsService } from './slash-commands.service.js';

@Module({
  imports: [DiscordModule, ConfigModule, CqrsModule],
  providers: [SlashCommandsService],
})
export class SlashCommandsModule implements OnApplicationBootstrap {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly service: SlashCommandsService,
  ) {}

  onApplicationBootstrap() {
    this.service.listenToCommands();
    if (this.configService.get('DISCORD_REFRESH_COMMANDS')) {
      // If we await here, the logs will be buffered since it's blocking application bootstrap
      this.service.registerCommands();
    }
  }
}
