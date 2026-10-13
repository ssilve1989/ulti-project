import { Module } from '@nestjs/common';
import { ErrorModule } from '../../error/error.module.js';
import { EventsModule } from '../../events/events.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { EventSchedulerJob } from './event-scheduler.job.js';

@Module({
  imports: [EventsModule, FirebaseModule, ErrorModule],
  providers: [EventSchedulerJob],
})
export class EventSchedulerModule {}
