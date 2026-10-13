import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { EventCleanerJob } from './event-cleaner.job.js';

@Module({
  imports: [FirebaseModule],
  providers: [EventCleanerJob],
})
export class EventCleanerModule {}
