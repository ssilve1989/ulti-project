import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscordModule } from '../discord/discord.module.js';
import { SlashCommandsService } from './slash-commands.service.js';

@Module({
  imports: [DiscordModule, ConfigModule],
  providers: [SlashCommandsService],
})
export class SlashCommandsModule implements OnApplicationBootstrap {
  constructor(private readonly service: SlashCommandsService) {}

  onApplicationBootstrap() {
    return this.service.registerCommands();
  }
}
