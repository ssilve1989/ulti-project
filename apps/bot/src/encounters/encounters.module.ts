import { Module } from '@nestjs/common';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { EncountersService } from './encounters.service.js';
import { EncountersComponentsService } from './encounters-components.service.js';

@Module({
  imports: [FirebaseModule],
  providers: [EncountersService, EncountersComponentsService],
  exports: [EncountersService, EncountersComponentsService],
})
export class EncountersModule {}
