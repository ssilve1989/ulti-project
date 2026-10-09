import { Module } from '@nestjs/common';
import { DiscordModule } from '../../discord/discord.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { BoardModule } from '../access/board.module.js';
import { BoardEventReader } from './board-event.reader.js';
import { EventsController } from './events.controller.js';

@Module({
  imports: [BoardModule, DiscordModule, FirebaseModule],
  controllers: [EventsController],
  providers: [BoardEventReader],
})
export class BoardEventsModule {}
