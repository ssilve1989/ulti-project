import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { SlashCommandsSharedModule } from '../shared/slash-commands-shared.module.js';
import { HelpCommandHandler } from './help.command-handler.js';

@Module({
  imports: [CqrsModule, ConfigModule, SlashCommandsSharedModule],
  providers: [HelpCommandHandler],
})
class HelpModule {}

export { HelpModule };
