import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { ErrorModule } from '../error/error.module.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { EventComponentsListener } from './components/event-components.listener.js';
import { EventEligibilityService } from './eligibility/event-eligibility.service.js';
import { EventMessageService } from './event-message.service.js';
import { EventSignupFlow } from './signup/event-signup.flow.js';
import { EventWithdrawFlow } from './signup/event-withdraw.flow.js';

@Module({
  imports: [DiscordModule, FirebaseModule, ErrorModule],
  providers: [
    EventMessageService,
    EventEligibilityService,
    EventSignupFlow,
    EventWithdrawFlow,
    EventComponentsListener,
  ],
  exports: [EventMessageService, EventEligibilityService],
})
export class EventsModule {}
