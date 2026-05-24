import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { HelperTeamAuthorizationService } from './helper-team-authorization.service.js';
import { HelperTeamMembershipService } from './helper-team-membership.service.js';
import { HelperTeamNotificationService } from './helper-team-notification.service.js';

@Module({
  imports: [DiscordModule, FirebaseModule],
  providers: [
    HelperTeamMembershipService,
    HelperTeamAuthorizationService,
    HelperTeamNotificationService,
  ],
  exports: [
    HelperTeamMembershipService,
    HelperTeamAuthorizationService,
    HelperTeamNotificationService,
  ],
})
export class HelperTeamModule {}
