import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '#src/discord/discord.module.js';
import { FirebaseModule } from '#src/firebase/firebase.module.js';
import { SheetsModule } from '#src/sheets/sheets.module.js';
import { RemoveSignupCommandHandler } from './handlers/remove-signup.command-handler.js';

@Module({
  imports: [CqrsModule, DiscordModule, FirebaseModule, SheetsModule],
  providers: [RemoveSignupCommandHandler],
})
export class RemoveSignupModule {}
