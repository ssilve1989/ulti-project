import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../discord/discord.module.js';
import { SlashCommandsService } from './slash-commands.service.js';

@Module({
  imports: [DiscordModule, ConfigModule, CqrsModule],
  providers: [SlashCommandsService],
})
export class SlashCommandsModule implements OnApplicationBootstrap {
  constructor(private readonly service: SlashCommandsService) {}

  async onApplicationBootstrap() {
    this.service.listenToCommands();
    await this.service.registerCommands();
  }
}
