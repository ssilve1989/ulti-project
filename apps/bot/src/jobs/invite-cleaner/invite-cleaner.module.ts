import { Module } from '@nestjs/common';
import { DiscordModule } from '#src/discord/discord.module.js';
import { FirebaseModule } from '#src/firebase/firebase.module.js';
import { InviteCleanerJob } from './invite-cleaner.job.js';

@Module({
  imports: [DiscordModule, FirebaseModule],
  providers: [InviteCleanerJob],
})
export class InviteCleanerModule {}
