import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { EncountersModule } from '../../encounters/encounters.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { EditSignupService } from './edit-signup.service.js';
import { EditSignupCommandHandler } from './handlers/edit-signup.command-handler.js';
import { ReconcileAnnouncementEventHandler } from './handlers/reconcile-announcement.event-handler.js';
import { UpdateReviewMessageEventHandler } from './handlers/update-review-message.event-handler.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    EncountersModule,
    ErrorModule,
    FirebaseModule,
    SheetsModule,
  ],
  providers: [
    EditSignupCommandHandler,
    EditSignupService,
    ReconcileAnnouncementEventHandler,
    UpdateReviewMessageEventHandler,
  ],
})
export class EditSignupModule {}
