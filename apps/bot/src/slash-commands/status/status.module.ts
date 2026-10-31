import { Module } from '@nestjs/common';
import { EncountersModule } from '#src/encounters/encounters.module.js';
import { ErrorModule } from '#src/error/error.module.js';
import { FirebaseModule } from '#src/firebase/firebase.module.js';
import { StatusCommandHandler } from './handlers/status.command-handler.js';
import { StatusService } from './status.service.js';

@Module({
  imports: [EncountersModule, ErrorModule, FirebaseModule],
  providers: [StatusService, StatusCommandHandler],
})
export class StatusModule {}
