import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { CleanRolesCommandHandler } from './clean-roles.command-handler.js';

@Module({
  imports: [CqrsModule, DiscordModule, ErrorModule, FirebaseModule],
  providers: [CleanRolesCommandHandler],
})
class CleanRolesModule {}

export { CleanRolesModule };
