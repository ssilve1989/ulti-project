import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscordModule } from '../../discord/discord.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { inviteCleanerConfig } from './invite-cleaner.config.js';
import { InviteCleanerJob } from './invite-cleaner.job.js';

@Module({
  imports: [
    DiscordModule,
    FirebaseModule,
    ConfigModule.forFeature(inviteCleanerConfig),
  ],
  providers: [InviteCleanerJob],
})
export class InviteCleanerModule {}
