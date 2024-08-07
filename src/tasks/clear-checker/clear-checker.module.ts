import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscordModule } from '../../discord/discord.module.js';
import { FfLogsModule } from '../../fflogs/fflogs.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { clearCheckerConfig } from './clear-checker.config.js';
import { ClearCheckerJob } from './clear-checker.job.js';

@Module({
  imports: [
    ConfigModule.forFeature(clearCheckerConfig),
    FfLogsModule,
    FirebaseModule,
    DiscordModule,
    SheetsModule,
  ],
  providers: [ClearCheckerJob],
})
export class ClearCheckerModule {}
