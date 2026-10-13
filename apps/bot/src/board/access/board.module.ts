import { Module } from '@nestjs/common';
import { BoardAuthModule } from '../../board-auth/board-auth.module.js';
import { DiscordModule } from '../../discord/discord.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { BoardAccessService } from './board-access.service.js';
import { BoardSessionGuard } from './board-session.guard.js';
import { HelpersController } from './helpers.controller.js';
import { MeController } from './me.controller.js';

@Module({
  imports: [BoardAuthModule, DiscordModule, FirebaseModule],
  controllers: [MeController, HelpersController],
  providers: [BoardAccessService, BoardSessionGuard],
  // what BoardSessionGuard needs, for the board's routes in other modules
  exports: [BoardAccessService, BoardAuthModule],
})
export class BoardModule {}
