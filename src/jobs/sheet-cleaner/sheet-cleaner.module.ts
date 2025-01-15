import { Module } from '@nestjs/common';
import { DiscordModule } from '../../discord/discord.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { SheetCleanerJob } from './sheet-cleaner.job.js';

@Module({
  imports: [DiscordModule, FirebaseModule, SheetsModule],
  providers: [SheetCleanerJob],
})
export class SheetCleanerModule {}
