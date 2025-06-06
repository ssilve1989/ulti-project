import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SearchCommandHandler } from './search.command-handler.js';

@Module({
  imports: [ConfigModule, CqrsModule, DiscordModule, FirebaseModule],
  providers: [SearchCommandHandler],
})
class SearchModule {}

export { SearchModule };
