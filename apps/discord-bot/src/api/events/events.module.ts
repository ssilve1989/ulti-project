import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { ParticipantsModule } from '../participants/participants.module.js';
import { DraftLocksController } from './draft-locks.controller.js';
import { DraftLocksService } from './draft-locks.service.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { RosterService } from './roster.service.js';

@Module({
  imports: [FirebaseModule, ParticipantsModule],
  controllers: [EventsController, DraftLocksController],
  providers: [EventsService, DraftLocksService, RosterService],
  exports: [EventsService, RosterService],
})
export class EventsModule {}
