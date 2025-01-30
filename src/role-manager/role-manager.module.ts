import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { RoleManagerService } from './role-manager.service.js';

@Module({
  imports: [DiscordModule, FirebaseModule],
  providers: [RoleManagerService],
  exports: [RoleManagerService],
})
export class RoleManagerModule {}
