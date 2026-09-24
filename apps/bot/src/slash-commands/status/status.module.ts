import { Module } from '@nestjs/common';
import { EncountersModule } from '../../encounters/encounters.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { StatusCommandHandler } from './handlers/status.command-handler.js';
import { StatusService } from './status.service.js';

@Module({
  imports: [EncountersModule, ErrorModule, FirebaseModule],
  providers: [StatusService, StatusCommandHandler],
})
export class StatusModule {}
