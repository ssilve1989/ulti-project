import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { EventsController } from './events.controller.js';

@Module({
  imports: [FirebaseModule],
  controllers: [EventsController],
})
export class EventsModule {}
