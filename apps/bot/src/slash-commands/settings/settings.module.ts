import { Module } from '@nestjs/common';
import { ComponentSessionModule } from '#src/discord/component-session.module.js';
import { EncountersModule } from '#src/encounters/encounters.module.js';
import { ErrorModule } from '#src/error/error.module.js';
import { FirebaseModule } from '#src/firebase/firebase.module.js';
import { SheetsModule } from '#src/sheets/sheets.module.js';
import { EditBlacklistChannelsCommandHandler } from './subcommands/blacklist-channels/edit-blacklist-channels.command-handler.js';
import { EditChannelsCommandHandler } from './subcommands/channels/edit-channels.command-handler.js';
import { EditProgPointRolesCommandHandler } from './subcommands/prog-point-roles/edit-prog-point-roles.command-handler.js';
import { EditReviewerCommandHandler } from './subcommands/reviewer/edit-reviewer.command-handler.js';
import { EditEncounterRolesCommandHandler } from './subcommands/roles/edit-encounter-roles.command-handler.js';
import { EditSpreadsheetCommandHandler } from './subcommands/spreadsheet/edit-spreadsheet.command-handler.js';
import { ViewSettingsCommandHandler } from './subcommands/view/view-settings.command-handler.js';

@Module({
  imports: [
    ComponentSessionModule,
    ErrorModule,
    FirebaseModule,
    SheetsModule,
    EncountersModule,
  ],
  providers: [
    EditBlacklistChannelsCommandHandler,
    EditChannelsCommandHandler,
    EditEncounterRolesCommandHandler,
    EditProgPointRolesCommandHandler,
    EditReviewerCommandHandler,
    EditSpreadsheetCommandHandler,
    ViewSettingsCommandHandler,
  ],
})
export class SettingsModule {}
