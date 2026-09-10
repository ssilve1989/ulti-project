import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { EncountersModule } from '../../encounters/encounters.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SignupModule } from '../signup/signup.module.js';
import { EditSignupCommandHandler } from './handlers/edit-signup.command-handler.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    EncountersModule,
    ErrorModule,
    FirebaseModule,
    SignupModule,
  ],
  providers: [EditSignupCommandHandler],
})
export class EditSignupModule {}
