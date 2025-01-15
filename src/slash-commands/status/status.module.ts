import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { StatusCommandHandler } from './status.command-handler.js';
import { StatusService } from './status.service.js';

@Module({
  imports: [FirebaseModule],
  providers: [StatusService, StatusCommandHandler],
})
export class StatusModule {}
