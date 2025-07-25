import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { EncountersModule } from '../../encounters/encounters.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { FfLogsModule } from '../../fflogs/fflogs.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { RemoveSignupCommandHandler } from '../remove-signup/remove-signup.command-handler.js';
import { RemoveRolesCommandHandler } from './commands/handlers/remove-roles.command-handler.js';
import { SignupCommandHandler } from './commands/handlers/signup.command-handler.js';
import { DeclineReasonRequestService } from './decline-reason-request.service.js';
import { AssignRolesEventHandler } from './events/handlers/assign-roles.event-handler.js';
import { SendApprovedMessageEventHandler } from './events/handlers/send-approved-message.event-handler.js';
import { SignupDeclineReasonEventHandler } from './events/handlers/signup-decline-reason.event-handler.js';
import { UpdateApprovalEmbedEventHandler } from './events/handlers/signup-embed.event-handler.js';
import { SignupService } from './signup.service.js';
import { SendSignupReviewCommandHandler } from './subcommands/send-signup-review/send-signup-review.command-handler.js';

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
