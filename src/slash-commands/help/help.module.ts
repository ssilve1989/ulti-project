import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ErrorModule } from '../../error/error.module.js';
import { SlashCommandsSharedModule } from '../shared/slash-commands-shared.module.js';
import { HelpCommandHandler } from './handlers/help.command-handler.js';

@Module({
  imports: [CqrsModule, ErrorModule, SlashCommandsSharedModule],
  providers: [HelpCommandHandler],
})
class HelpModule {}

export { HelpModule };
