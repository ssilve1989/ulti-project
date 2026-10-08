import { Module } from '@nestjs/common';
import { ComponentSessionModule } from '../../discord/component-session.module.js';
import { EncountersModule } from '../../encounters/encounters.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { EditBlacklistChannelsCommandHandler } from './subcommands/blacklist-channels/edit-blacklist-channels.command-handler.js';
import { EditBoardAccessCommandHandler } from './subcommands/board-access/edit-board-access.command-handler.js';
import { EditChannelsCommandHandler } from './subcommands/channels/edit-channels.command-handler.js';
import { EditEventOrganizersCommandHandler } from './subcommands/event-organizers/edit-event-organizers.command-handler.js';
import { EditJobEmojisCommandHandler } from './subcommands/job-emojis/edit-job-emojis.command-handler.js';
import { EditProgPointRolesCommandHandler } from './subcommands/prog-point-roles/edit-prog-point-roles.command-handler.js';
import { EditReviewerCommandHandler } from './subcommands/reviewer/edit-reviewer.command-handler.js';
import { EditEncounterRolesCommandHandler } from './subcommands/roles/edit-encounter-roles.command-handler.js';
import { EditSpreadsheetCommandHandler } from './subcommands/spreadsheet/edit-spreadsheet.command-handler.js';
import { AddSquadCommandHandler } from './subcommands/squads/add-squad.command-handler.js';
import { RemoveSquadCommandHandler } from './subcommands/squads/remove-squad.command-handler.js';
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
    AddSquadCommandHandler,
    EditBlacklistChannelsCommandHandler,
    EditBoardAccessCommandHandler,
    EditChannelsCommandHandler,
    EditEncounterRolesCommandHandler,
    EditEventOrganizersCommandHandler,
    EditJobEmojisCommandHandler,
    EditProgPointRolesCommandHandler,
    EditReviewerCommandHandler,
    RemoveSquadCommandHandler,
    EditSpreadsheetCommandHandler,
    ViewSettingsCommandHandler,
  ],
})
export class SettingsModule {}
