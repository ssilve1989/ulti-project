import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../discord/discord.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { RemoveRoleCommandHandler } from './remove-role.command-handler.js';

@Module({
  imports: [CqrsModule, DiscordModule, SettingsModule],
  providers: [RemoveRoleCommandHandler],
})
class RemoveRoleModule {}

export { RemoveRoleModule };
