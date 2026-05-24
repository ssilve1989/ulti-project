import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { HelperTeamModule } from '../../helper-team/helper-team.module.js';
import { HelpersCommandHandler } from './handlers/helpers.command-handler.js';

@Module({
  imports: [CqrsModule, ErrorModule, FirebaseModule, HelperTeamModule],
  providers: [HelpersCommandHandler],
})
export class HelpersModule {}
