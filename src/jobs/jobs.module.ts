import { Module } from '@nestjs/common';
import { BotStatusModule } from './bot-status/bot-status.module.js';
import { ClearCheckerModule } from './clear-checker/clear-checker.module.js';
import { InviteCleanerModule } from './invite-cleaner/invite-cleaner.module.js';
import { SheetCleanerModule } from './sheet-cleaner/sheet-cleaner.module.js';

@Module({
  imports: [
    ClearCheckerModule,
    SheetCleanerModule,
    InviteCleanerModule,
    BotStatusModule,
  ],
})
export class JobsModule {}
