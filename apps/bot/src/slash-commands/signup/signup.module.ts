import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '#src/discord/discord.module.js';
import { EncountersModule } from '#src/encounters/encounters.module.js';
import { ErrorModule } from '#src/error/error.module.js';
import { FfLogsModule } from '#src/fflogs/fflogs.module.js';
import { FirebaseModule } from '#src/firebase/firebase.module.js';
import { RoleManagerModule } from '#src/role-manager/role-manager.module.js';
import { SheetsModule } from '#src/sheets/sheets.module.js';
import { ApprovalDecisionRequestService } from './approval-decision-request.service.js';
import { DeclineReasonRequestService } from './decline-reason-request.service.js';
import { AssignRolesEventHandler } from './handlers/assign-roles.event-handler.js';
import { SendApprovalCommentDmEventHandler } from './handlers/send-approval-comment-dm.event-handler.js';
import { SendApprovedMessageEventHandler } from './handlers/send-approved-message.event-handler.js';
import { SendSignupReviewCommandHandler } from './handlers/send-signup-review.command-handler.js';
import { SignupCommandHandler } from './handlers/signup.command-handler.js';
import { SignupDeclineReasonEventHandler } from './handlers/signup-decline-reason.event-handler.js';
import { UpdateApprovalEmbedEventHandler } from './handlers/signup-embed.event-handler.js';
import { SignupSagas } from './signup.sagas.js';
import { SignupService } from './signup.service.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    EncountersModule,
    ErrorModule,
    FfLogsModule,
    FirebaseModule,
    RoleManagerModule,
    SheetsModule,
  ],
  providers: [
    ApprovalDecisionRequestService,
    AssignRolesEventHandler,
    DeclineReasonRequestService,
    SendApprovalCommentDmEventHandler,
    SendApprovedMessageEventHandler,
    SendSignupReviewCommandHandler,
    SignupCommandHandler,
    SignupDeclineReasonEventHandler,
    SignupSagas,
    SignupService,
    UpdateApprovalEmbedEventHandler,
  ],
})
class SignupModule {}

export { SignupModule };
