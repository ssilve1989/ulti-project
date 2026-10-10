import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { BoardModule } from '../board/access/board.module.js';
import { BoardEventsModule } from '../board/events/board-events.module.js';
import { BoardAuthModule } from '../board-auth/board-auth.module.js';
import { boardConfig } from '../config/board.js';
import { DiscordModule } from '../discord/discord.module.js';
import { boardStaticModules } from './board-static.js';
import { FlyThrottlerGuard } from './fly-throttler.guard.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    DiscordModule,
    BoardAuthModule,
    BoardModule,
    BoardEventsModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ...boardStaticModules(boardConfig.BOARD_STATIC_DIR),
  ],
  controllers: [HealthController],
  // only HTTP controllers pass through guards; better-auth's /api/auth routes have their own limiter
  providers: [{ provide: APP_GUARD, useClass: FlyThrottlerGuard }],
})
export class HttpModule {}
