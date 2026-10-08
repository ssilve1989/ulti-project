import { Module } from '@nestjs/common';
import { DiscordModule } from '#src/discord/discord.module.js';
import { ErrorModule } from '#src/error/error.module.js';
import { FirebaseModule } from '#src/firebase/firebase.module.js';
import { CleanRolesCommandHandler } from './handlers/clean-roles.command-handler.js';

@Module({
  imports: [DiscordModule, ErrorModule, FirebaseModule],
  providers: [CleanRolesCommandHandler],
})
class CleanRolesModule {}

export { CleanRolesModule };
