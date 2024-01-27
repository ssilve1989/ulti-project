import { Module } from '@nestjs/common';
import { EditSettingsCommandHandler } from './commands/handlers/edit-settings-command.handler.js';
import { SettingsService } from './settings.service.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { ViewSettingsCommandHandler } from './commands/handlers/view-settings-command.handler.js';
import { SheetsModule } from '../sheets/sheets.module.js';

@Module({
  imports: [FirebaseModule, SheetsModule],
  providers: [
    EditSettingsCommandHandler,
    SettingsService,
    ViewSettingsCommandHandler,
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
