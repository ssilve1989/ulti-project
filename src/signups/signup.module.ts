import { Module } from '@nestjs/common';
import { SignupCommandHandler } from './commands/handlers/signup-command.handler.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { CqrsModule } from '@nestjs/cqrs';
import { SignupSagas } from './signup.saga.js';
import { DiscordModule } from '../discord/discord.module.js';
import { SendSignupReviewCommandHandler } from './commands/handlers/send-signup-review-command.handler.js';
import { SignupReviewService } from './signup-review.service.js';
import { SignupRepository } from './signup.repository.js';
import { SettingsModule } from '../settings/settings.module.js';

@Module({
  imports: [CqrsModule, FirebaseModule, DiscordModule, SettingsModule],
  providers: [
    SendSignupReviewCommandHandler,
    SignupReviewService,
    SignupCommandHandler,
    SignupSagas,
    SignupRepository,
  ],
})
class SignupModule {}

export { SignupModule };
