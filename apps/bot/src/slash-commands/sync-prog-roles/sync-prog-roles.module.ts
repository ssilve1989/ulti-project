import { Module } from '@nestjs/common';
import { DiscordModule } from '../../discord/discord.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { RoleManagerModule } from '../../role-manager/role-manager.module.js';
import { SyncProgRolesCommandHandler } from './handlers/sync-prog-roles.command-handler.js';

@Module({
  imports: [DiscordModule, ErrorModule, FirebaseModule, RoleManagerModule],
  providers: [SyncProgRolesCommandHandler],
})
class SyncProgRolesModule {}

export { SyncProgRolesModule };
