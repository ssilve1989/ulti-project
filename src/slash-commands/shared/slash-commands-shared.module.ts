import { Module } from '@nestjs/common';
import { SlashCommandsProvider } from '../slash-commands.provider.js';

@Module({
  providers: [SlashCommandsProvider],
  exports: [SlashCommandsProvider],
})
export class SlashCommandsSharedModule {}
