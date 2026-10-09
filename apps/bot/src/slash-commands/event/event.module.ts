import { Module } from '@nestjs/common';
import { ComponentSessionModule } from '../../discord/component-session.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { EventsModule } from '../../events/events.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { CloseEventCommandHandler } from './handlers/close-event.command-handler.js';
import { CreateEventCommandHandler } from './handlers/create-event.command-handler.js';
import { ScheduleCreateCommandHandler } from './handlers/schedule-create.command-handler.js';
import { ScheduleDeleteCommandHandler } from './handlers/schedule-delete.command-handler.js';
import { ScheduleEditCommandHandler } from './handlers/schedule-edit.command-handler.js';
import { ScheduleListCommandHandler } from './handlers/schedule-list.command-handler.js';
import { SchedulePauseCommandHandler } from './handlers/schedule-pause.command-handler.js';
import { ScheduleResumeCommandHandler } from './handlers/schedule-resume.command-handler.js';

@Module({
  imports: [ComponentSessionModule, ErrorModule, EventsModule, FirebaseModule],
  providers: [
    CreateEventCommandHandler,
    CloseEventCommandHandler,
    ScheduleCreateCommandHandler,
    ScheduleEditCommandHandler,
    ScheduleListCommandHandler,
    SchedulePauseCommandHandler,
    ScheduleResumeCommandHandler,
    ScheduleDeleteCommandHandler,
  ],
})
export class EventModule {}
