import { Module } from '@nestjs/common';
import { SignupCommandHandler } from './signup-command.handler.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { CqrsModule } from '@nestjs/cqrs';
import { SignupSagas } from './signup.saga.js';
import { DiscordModule } from '../../discord/discord.module.js';
import { SendSignupReviewCommandHandler } from './subcommands/send-signup-review/send-signup-review-command.handler.js';
import { SignupService } from './signup.service.js';
import { SignupRepository } from '../../firebase/repositories/signup.repository.js';
import { SettingsModule } from '../settings/settings.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { RemoveSignupCommandHandler } from './subcommands/remove-signup/remove-signup-command.handler.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    FirebaseModule,
    SettingsModule,
    SheetsModule,
  ],
  providers: [
    RemoveSignupCommandHandler,
    SendSignupReviewCommandHandler,
    SignupCommandHandler,
    SignupRepository,
    SignupService,
    SignupSagas,
  ],
})
class SignupModule {}

export { SignupModule };
