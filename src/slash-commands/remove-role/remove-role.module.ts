import { Module } from '@nestjs/common';
import { DiscordModule } from '../../discord/discord.module.js';
import { RemoveRoleCommandHandler } from './handlers/remove-role.command-handler.js';

@Module({
  imports: [DiscordModule],
  providers: [RemoveRoleCommandHandler],
})
class RemoveRoleModule {}

export { RemoveRoleModule };
