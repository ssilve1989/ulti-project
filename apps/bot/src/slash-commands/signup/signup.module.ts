import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { EncountersModule } from '../../encounters/encounters.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { FfLogsModule } from '../../fflogs/fflogs.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { RoleManagerModule } from '../../role-manager/role-manager.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { AssignRolesEventHandler } from './handlers/assign-roles.event-handler.js';
import { ClearApprovalMessageOnDeclineEventHandler } from './handlers/clear-approval-message-on-decline.event-handler.js';
import { RequestApprovalCommentEventHandler } from './handlers/request-approval-comment.event-handler.js';
import { RequestDeclineReasonEventHandler } from './handlers/request-decline-reason.event-handler.js';
import { SendApprovedMessageEventHandler } from './handlers/send-approved-message.event-handler.js';
import { SendSignupReviewCommandHandler } from './handlers/send-signup-review.command-handler.js';
import { SignupCommandHandler } from './handlers/signup.command-handler.js';
import { SignupApprovalCommentNotifier } from './handlers/signup-approval-comment.notifier.js';
import { SignupDeclineReasonNotifier } from './handlers/signup-decline-reason.notifier.js';
import { UpdateApprovalEmbedEventHandler } from './handlers/signup-embed.event-handler.js';
import { ReviewDmFlowService } from './review-dm-flow.service.js';
import { SignupSagas } from './signup.sagas.js';
import { SignupService } from './signup.service.js';
import { SignupMutationService } from './signup-mutation.service.js';

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
    AssignRolesEventHandler,
    ClearApprovalMessageOnDeclineEventHandler,
    RequestApprovalCommentEventHandler,
    RequestDeclineReasonEventHandler,
    ReviewDmFlowService,
    SendApprovedMessageEventHandler,
    SendSignupReviewCommandHandler,
    SignupApprovalCommentNotifier,
    SignupCommandHandler,
    SignupDeclineReasonNotifier,
    SignupMutationService,
    SignupSagas,
    SignupService,
    UpdateApprovalEmbedEventHandler,
  ],
  exports: [SignupMutationService],
})
class SignupModule {}

export { SignupModule };
