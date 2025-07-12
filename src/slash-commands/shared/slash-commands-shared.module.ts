import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SlashCommandsProvider } from '../slash-commands.provider.js';

@Module({
  imports: [ConfigModule],
  providers: [SlashCommandsProvider],
  exports: [SlashCommandsProvider],
})
export class SlashCommandsSharedModule {}
