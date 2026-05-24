import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { HelperTeamModule } from '../../helper-team/helper-team.module.js';
import { TeamsCommandHandler } from './handlers/teams.command-handler.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    ErrorModule,
    FirebaseModule,
    HelperTeamModule,
  ],
  providers: [TeamsCommandHandler],
})
export class TeamsModule {}
