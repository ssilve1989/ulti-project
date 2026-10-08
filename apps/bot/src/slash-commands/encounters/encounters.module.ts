import { Module } from '@nestjs/common';
import { EncountersModule as CoreEncountersModule } from '#src/encounters/encounters.module.js';
import { ErrorModule } from '#src/error/error.module.js';
import { ViewEncounterCommandHandler } from './handlers/view-encounter.command-handler.js';

@Module({
  imports: [CoreEncountersModule, ErrorModule],
  providers: [ViewEncounterCommandHandler],
  exports: [ViewEncounterCommandHandler],
})
export class EncountersSlashCommandModule {}
