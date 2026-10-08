import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { EventMessageService } from './event-message.service.js';

@Module({
  imports: [DiscordModule, FirebaseModule],
  providers: [EventMessageService],
  exports: [EventMessageService],
})
export class EventsModule {}
