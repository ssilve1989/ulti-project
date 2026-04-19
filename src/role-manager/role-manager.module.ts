import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../discord/discord.module.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { RemoveRolesCommandHandler } from './remove-roles.command-handler.js';
import { RoleManagerService } from './role-manager.service.js';

@Module({
  imports: [CqrsModule, DiscordModule, FirebaseModule],
  providers: [RemoveRolesCommandHandler, RoleManagerService],
  exports: [RoleManagerService],
})
export class RoleManagerModule {}
