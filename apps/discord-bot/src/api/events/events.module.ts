import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { EventsSeederService } from './events-seeder.service.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({
  imports: [FirebaseModule],
  controllers: [EventsController],
  providers: [EventsService, EventsSeederService],
})
export class EventsModule {}
