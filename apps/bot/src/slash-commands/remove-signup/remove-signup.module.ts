import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { RemoveSignupCommandHandler } from './handlers/remove-signup.command-handler.js';

@Module({
  imports: [CqrsModule, DiscordModule, FirebaseModule, SheetsModule],
  providers: [RemoveSignupCommandHandler],
})
export class RemoveSignupModule {}
