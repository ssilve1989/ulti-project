import { Module } from '@nestjs/common';
import { DiscordModule } from '#src/discord/discord.module.js';
import { FirebaseModule } from '#src/firebase/firebase.module.js';
import { SheetsModule } from '#src/sheets/sheets.module.js';
import { SheetCleanerJob } from './sheet-cleaner.job.js';

@Module({
  imports: [DiscordModule, FirebaseModule, SheetsModule],
  providers: [SheetCleanerJob],
})
export class SheetCleanerModule {}
