import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AssignRolesEventHandler } from './handlers/assign-roles.event-handler.js';
import { RemoveRolesCommandHandler } from './handlers/remove-roles.command-handler.js';
import { SendApprovedMessageEventHandler } from './handlers/send-approved-message.event-handler.js';
import { UpdateApprovalEmbedEventHandler } from './handlers/signup-embed.event-handler.js';
import { SignupCommandHandler } from './handlers/signup.command-handler.js';
import { SignupSagas } from './signup.saga.js';
import { SignupService } from './signup.service.js';
import { RemoveSignupCommandHandler } from './subcommands/remove-signup/remove-signup.command-handler.js';
import { SendSignupReviewCommandHandler } from './subcommands/send-signup-review/send-signup-review.command-handler.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    FirebaseModule,
    SettingsModule,
    SheetsModule,
  ],
  providers: [
    AssignRolesEventHandler,
    RemoveRolesCommandHandler,
    RemoveSignupCommandHandler,
    SendApprovedMessageEventHandler,
    SendSignupReviewCommandHandler,
    SignupCommandHandler,
    SignupSagas,
    SignupService,
    UpdateApprovalEmbedEventHandler,
  ],
})
class SignupModule {}

export { SignupModule };
