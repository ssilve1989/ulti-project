import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../discord/discord.module.js';
import { RemoveRoleCommandHandler } from './remove-role.command-handler.js';

@Module({
  imports: [CqrsModule, DiscordModule],
  providers: [RemoveRoleCommandHandler],
})
class RemoveRoleModule {}

export { RemoveRoleModule };
