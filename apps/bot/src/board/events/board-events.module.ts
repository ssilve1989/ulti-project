import { Module } from '@nestjs/common';
import { DiscordModule } from '../../discord/discord.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { EventsModule } from '../../events/events.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { BoardModule } from '../access/board.module.js';
import { BoardEventReader } from './board-event.reader.js';
import { ClaimsController } from './claims.controller.js';
import { EventsController } from './events.controller.js';

@Module({
  imports: [
    BoardModule,
    DiscordModule,
    ErrorModule,
    EventsModule,
    FirebaseModule,
  ],
  controllers: [EventsController, ClaimsController],
  providers: [BoardEventReader],
})
export class BoardEventsModule {}
