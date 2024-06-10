import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { AppConfig } from '../app.config.js';
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

  async onApplicationBootstrap() {
    this.service.listenToCommands();
    if (this.configService.get('DISCORD_REFRESH_COMMANDS')) {
      await this.service.registerCommands();
    }
  }
}
