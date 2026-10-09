import { Module } from '@nestjs/common';
import { BoardModule } from '../board/access/board.module.js';
import { BoardEventsModule } from '../board/events/board-events.module.js';
import { BoardAuthModule } from '../board-auth/board-auth.module.js';
import { DiscordModule } from '../discord/discord.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [DiscordModule, BoardAuthModule, BoardModule, BoardEventsModule],
  controllers: [HealthController],
})
export class HttpModule {}
