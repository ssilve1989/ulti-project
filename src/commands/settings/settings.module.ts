import { Module } from '@nestjs/common';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { EditSettingsCommandHandler } from './subcommands/edit-settings-command.handler.js';
import { ViewSettingsCommandHandler } from './subcommands/view-settings-command.handler.js';

@Module({
  imports: [FirebaseModule, SheetsModule],
  providers: [
    EditSettingsCommandHandler,
    SettingsCollection,
    ViewSettingsCommandHandler,
  ],
  exports: [SettingsCollection],
})
export class SettingsModule {}
