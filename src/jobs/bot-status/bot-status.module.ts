import { Module } from '@nestjs/common';
import { DiscordModule } from '../../discord/discord.module.js';
import { BotStatusJob } from './bot-status.job.js';

@Module({
  imports: [DiscordModule],
  providers: [BotStatusJob],
})
export class BotStatusModule {}
