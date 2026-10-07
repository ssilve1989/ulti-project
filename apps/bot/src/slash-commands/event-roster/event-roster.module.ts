import { Module } from '@nestjs/common';
import { EncountersModule } from '../../encounters/encounters.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { RaidHelperModule } from '../../raid-helper/raid-helper.module.js';
import { EventRosterService } from './event-roster.service.js';
import { EventRosterCommandHandler } from './handlers/event-roster.command-handler.js';

@Module({
  imports: [EncountersModule, FirebaseModule, RaidHelperModule],
  providers: [EventRosterService, EventRosterCommandHandler],
})
class EventRosterModule {}

export { EventRosterModule };
