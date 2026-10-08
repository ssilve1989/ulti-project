import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '#src/discord/discord.module.js';
import { FirebaseModule } from '#src/firebase/firebase.module.js';
import { ProgPointRolesService } from './prog-point-roles.service.js';
import { RemoveRolesCommandHandler } from './remove-roles.command-handler.js';
import { RoleManagerService } from './role-manager.service.js';

@Module({
  imports: [CqrsModule, DiscordModule, FirebaseModule],
  providers: [
    ProgPointRolesService,
    RemoveRolesCommandHandler,
    RoleManagerService,
  ],
  exports: [ProgPointRolesService, RoleManagerService],
})
export class RoleManagerModule {}
