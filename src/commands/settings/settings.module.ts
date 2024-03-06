import { Module } from '@nestjs/common';
import { EditSettingsCommandHandler } from './subcommands/edit-settings-command.handler.js';
import { SettingsService } from './settings.service.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { ViewSettingsCommandHandler } from './subcommands/view-settings-command.handler.js';
import { SheetsModule } from '../../sheets/sheets.module.js';

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
