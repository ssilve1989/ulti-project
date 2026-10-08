import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { EventEligibilityService } from './eligibility/event-eligibility.service.js';
import { EventMessageService } from './event-message.service.js';

@Module({
  imports: [DiscordModule, FirebaseModule],
  providers: [EventMessageService, EventEligibilityService],
  exports: [EventMessageService, EventEligibilityService],
})
export class EventsModule {}
