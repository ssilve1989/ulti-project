import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { FfLogsModule } from '../fflogs/fflogs.module.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { SheetsModule } from '../sheets/sheets.module.js';
import { ClearCheckerJob } from './clear-checker.job.js';

@Module({
  imports: [FfLogsModule, FirebaseModule, DiscordModule, SheetsModule],
  providers: [ClearCheckerJob],
})
export class TasksModule {}
