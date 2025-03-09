import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { RetireCommandHandler } from './retire.command-handler.js';

@Module({
  imports: [CqrsModule, DiscordModule],
  providers: [RetireCommandHandler],
})
export class RetireModule {}
