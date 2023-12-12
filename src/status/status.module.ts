import { Module } from '@nestjs/common';
import { StatusService } from './status.service.js';
import { StatusCommandHandler } from './handlers/status-command.handler.js';
import { FirebaseModule } from '../firebase/firebase.module.js';

@Module({
  imports: [FirebaseModule],
  providers: [StatusService, StatusCommandHandler],
})
export class StatusModule {}
