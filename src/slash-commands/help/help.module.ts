import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { SlashCommandsProvider } from '../slash-commands.provider.js';
import { HelpCommandHandler } from './help.command-handler.js';

@Module({
  imports: [CqrsModule, ConfigModule],
  providers: [HelpCommandHandler, SlashCommandsProvider],
})
class HelpModule {}

export { HelpModule };
