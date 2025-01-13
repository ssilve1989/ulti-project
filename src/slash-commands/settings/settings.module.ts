import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { EditSettingsCommandHandler } from './subcommands/edit/edit-settings.command-handler.js';
import { ViewSettingsCommandHandler } from './subcommands/view/view-settings.command-handler.js';

@Module({
  imports: [FirebaseModule, SheetsModule],
  providers: [EditSettingsCommandHandler, ViewSettingsCommandHandler],
})
export class SettingsModule {}
