import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscordModule } from '../discord/discord.module.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { BlacklistUpdatedEventHandler } from './events/handlers/blacklist-updated.event-handler.js';
import { BlacklistAddCommandHandler } from './subcommands/add/blacklist-add.command-handler.js';
import { BlacklistDisplayCommandHandler } from './subcommands/display/blacklist-display.command-handler.js';
import { BlacklistRemoveCommandHandler } from './subcommands/remove/blacklist-remove.command-handler.js';

/**
 * Don't wanna be on the blacklist? Don't be an asshole.
 */
@Module({
  imports: [CqrsModule, DiscordModule, FirebaseModule],
  providers: [
    BlacklistAddCommandHandler,
    BlacklistRemoveCommandHandler,
    BlacklistDisplayCommandHandler,
    BlacklistUpdatedEventHandler,
  ],
})
class BlacklistModule {}

export { BlacklistModule };
