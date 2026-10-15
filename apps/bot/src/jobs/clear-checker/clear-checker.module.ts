import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '#src/discord/discord.module.js';
import { ErrorModule } from '#src/error/error.module.js';
import { FfLogsModule } from '#src/fflogs/fflogs.module.js';
import { FirebaseModule } from '#src/firebase/firebase.module.js';
import { SheetsModule } from '#src/sheets/sheets.module.js';
import { ClearCheckerJob } from './clear-checker.job.js';

@Module({
  imports: [
    CqrsModule,
    ErrorModule,
    FfLogsModule,
    FirebaseModule,
    DiscordModule,
    SheetsModule,
  ],
  providers: [ClearCheckerJob],
})
export class ClearCheckerModule {}
