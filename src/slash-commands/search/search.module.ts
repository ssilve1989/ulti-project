import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../../discord/discord.module.js';
import { EncountersModule } from '../../encounters/encounters.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SearchCommandHandler } from './handlers/search.command-handler.js';

@Module({
  imports: [CqrsModule, DiscordModule, EncountersModule, FirebaseModule],
  providers: [SearchCommandHandler],
})
class SearchModule {}

export { SearchModule };
