import { Module } from '@nestjs/common';
import { DiscordModule } from '#src/discord/discord.module.js';
import { RetireCommandHandler } from './handlers/retire.command-handler.js';

@Module({
  imports: [DiscordModule],
  providers: [RetireCommandHandler],
})
export class RetireModule {}
