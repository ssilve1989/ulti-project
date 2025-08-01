import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { EncountersModule } from '../../encounters/encounters.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { FfLogsModule } from '../../fflogs/fflogs.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { RemoveSignupCommandHandler } from '../remove-signup/handlers/remove-signup.command-handler.js';
import { DeclineReasonRequestService } from './decline-reason-request.service.js';
import { AssignRolesEventHandler } from './handlers/assign-roles.event-handler.js';
import { RemoveRolesCommandHandler } from './handlers/remove-roles.command-handler.js';
import { SendApprovedMessageEventHandler } from './handlers/send-approved-message.event-handler.js';
import { SendSignupReviewCommandHandler } from './handlers/send-signup-review.command-handler.js';
import { SignupCommandHandler } from './handlers/signup.command-handler.js';
import { SignupDeclineReasonEventHandler } from './handlers/signup-decline-reason.event-handler.js';
import { UpdateApprovalEmbedEventHandler } from './handlers/signup-embed.event-handler.js';
import { SignupService } from './signup.service.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    EncountersModule,
    ErrorModule,
    FfLogsModule,
    FirebaseModule,
    SheetsModule,
  ],
  providers: [
    AssignRolesEventHandler,
    DeclineReasonRequestService,
    RemoveRolesCommandHandler,
    RemoveSignupCommandHandler,
    SendApprovedMessageEventHandler,
    SendSignupReviewCommandHandler,
    SignupCommandHandler,
    SignupDeclineReasonEventHandler,
    SignupService,
    UpdateApprovalEmbedEventHandler,
  ],
})
class SignupModule {}

export { SignupModule };
