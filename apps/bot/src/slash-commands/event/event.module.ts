import { Module } from '@nestjs/common';
import { EventsModule } from '../../events/events.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { CloseEventCommandHandler } from './handlers/close-event.command-handler.js';
import { CreateEventCommandHandler } from './handlers/create-event.command-handler.js';
import { ScheduleCreateCommandHandler } from './handlers/schedule-create.command-handler.js';
import { ScheduleEditCommandHandler } from './handlers/schedule-edit.command-handler.js';

@Module({
  imports: [EventsModule, FirebaseModule],
  providers: [
    CreateEventCommandHandler,
    CloseEventCommandHandler,
    ScheduleCreateCommandHandler,
    ScheduleEditCommandHandler,
  ],
})
export class EventModule {}
