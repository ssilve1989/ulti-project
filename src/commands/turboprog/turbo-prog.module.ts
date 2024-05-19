import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TurboProgCommandHandler } from './turbo-prog.command-handler.js';

@Module({
  imports: [SettingsModule, SheetsModule, FirebaseModule],
  providers: [TurboProgCommandHandler],
})
export class TurboProgModule {}
