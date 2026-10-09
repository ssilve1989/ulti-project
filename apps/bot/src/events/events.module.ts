import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ClaimedWithdrawalHandler } from '../board/alerts/claimed-withdrawal.handler.js';
import { ComponentSessionModule } from '../discord/component-session.module.js';
import { DiscordModule } from '../discord/discord.module.js';
import { ErrorModule } from '../error/error.module.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { EventComponentsListener } from './components/event-components.listener.js';
import { EventEligibilityService } from './eligibility/event-eligibility.service.js';
import { EventChangesBus } from './event-changes.bus.js';
import { EventMessageService } from './event-message.service.js';
import { PostedEventsUpdater } from './schedules/posted-events.updater.js';
import { SchedulePanelSession } from './schedules/schedule-panel.session.js';
import { EventSignupFlow } from './signup/event-signup.flow.js';
import { EventWithdrawFlow } from './signup/event-withdraw.flow.js';

@Module({
  imports: [
    CqrsModule,
    ComponentSessionModule,
    DiscordModule,
    FirebaseModule,
    ErrorModule,
  ],
  providers: [
    EventChangesBus,
    EventMessageService,
    EventEligibilityService,
    EventSignupFlow,
    EventWithdrawFlow,
    EventComponentsListener,
    SchedulePanelSession,
    PostedEventsUpdater,
    ClaimedWithdrawalHandler,
  ],
  exports: [
    EventChangesBus,
    EventMessageService,
    EventEligibilityService,
    SchedulePanelSession,
    PostedEventsUpdater,
  ],
})
export class EventsModule {}
