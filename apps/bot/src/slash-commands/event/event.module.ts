import { Module } from '@nestjs/common';
import { EventsModule } from '../../events/events.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { CloseEventCommandHandler } from './handlers/close-event.command-handler.js';
import { CreateEventCommandHandler } from './handlers/create-event.command-handler.js';

@Module({
  imports: [EventsModule, FirebaseModule],
  providers: [CreateEventCommandHandler, CloseEventCommandHandler],
})
export class EventModule {}
