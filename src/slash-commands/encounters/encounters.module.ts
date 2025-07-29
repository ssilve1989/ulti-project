import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EncountersModule as CoreEncountersModule } from '../../encounters/encounters.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { EncountersCommandHandler } from './commands/handlers/encounters.command-handler.js';
import { ManageProgPointsCommandHandler } from './commands/handlers/manage-prog-points.command-handler.js';
import { SetThresholdsCommandHandler } from './commands/handlers/set-thresholds.command-handler.js';
import { ViewEncounterCommandHandler } from './commands/handlers/view-encounter.command-handler.js';

const CommandHandlers = [
  EncountersCommandHandler,
  SetThresholdsCommandHandler,
  ManageProgPointsCommandHandler,
  ViewEncounterCommandHandler,
];

@Module({
  imports: [CqrsModule, CoreEncountersModule, ErrorModule],
  providers: [...CommandHandlers],
  exports: [...CommandHandlers],
})
export class EncountersSlashCommandModule {}
