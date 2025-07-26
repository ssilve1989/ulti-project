import { Module } from '@nestjs/common';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { EditChannelsCommandHandler } from './subcommands/channels/edit-channels.command-handler.js';
import { EditReviewerCommandHandler } from './subcommands/reviewer/edit-reviewer.command-handler.js';
import { EditEncounterRolesCommandHandler } from './subcommands/roles/edit-encounter-roles.command-handler.js';
import { EditSpreadsheetCommandHandler } from './subcommands/spreadsheet/edit-spreadsheet.command-handler.js';
import { EditTurboProgCommandHandler } from './subcommands/turbo-prog/edit-turbo-prog.command-handler.js';
import { ViewSettingsCommandHandler } from './subcommands/view/view-settings.command-handler.js';

@Module({
  imports: [ErrorModule, FirebaseModule, SheetsModule],
  providers: [
    EditChannelsCommandHandler,
    EditEncounterRolesCommandHandler,
    EditReviewerCommandHandler,
    EditSpreadsheetCommandHandler,
    EditTurboProgCommandHandler,
    ViewSettingsCommandHandler,
  ],
})
export class SettingsModule {}
