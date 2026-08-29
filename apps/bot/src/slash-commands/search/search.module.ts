import { Module } from '@nestjs/common';
import { DiscordModule } from '../../discord/discord.module.js';
import { EncountersModule } from '../../encounters/encounters.module.js';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SearchCommandHandler } from './handlers/search.command-handler.js';

@Module({
  imports: [DiscordModule, EncountersModule, ErrorModule, FirebaseModule],
  providers: [SearchCommandHandler],
})
class SearchModule {}

export { SearchModule };
