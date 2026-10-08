import { Module } from '@nestjs/common';
import { ComponentSessionModule } from '#src/discord/component-session.module.js';
import { DiscordModule } from '#src/discord/discord.module.js';
import { EncountersModule } from '#src/encounters/encounters.module.js';
import { FirebaseModule } from '#src/firebase/firebase.module.js';
import { SearchCommandHandler } from './handlers/search.command-handler.js';

@Module({
  imports: [
    ComponentSessionModule,
    DiscordModule,
    EncountersModule,
    FirebaseModule,
  ],
  providers: [SearchCommandHandler],
})
class SearchModule {}

export { SearchModule };
