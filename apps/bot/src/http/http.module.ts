import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [DiscordModule],
  controllers: [HealthController],
})
export class HttpModule {}
