import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { DiscordService } from '../discord/discord.service.js';
import { SettingsCollection } from '../firebase/collections/settings-collection.js';
import { HelperTeamMembershipService } from './helper-team-membership.service.js';

@Injectable()
export class HelperTeamAuthorizationService {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly discordService: DiscordService,
    private readonly membershipService: HelperTeamMembershipService,
  ) {}

  @SentryTraced()
  public async isCoordinator(
    guildId: string,
    discordId: string,
  ): Promise<boolean> {
    const settings = await this.settingsCollection.getSettings(guildId);
    if (!settings?.coordinatorRole) return false;
    return this.discordService.userHasRole({
      guildId,
      userId: discordId,
      roleId: settings.coordinatorRole,
    });
  }

  @SentryTraced()
  public async canUseHelperSelfService(
    guildId: string,
    discordId: string,
  ): Promise<boolean> {
    const [isCoord, memberships] = await Promise.all([
      this.isCoordinator(guildId, discordId),
      this.membershipService.getMembershipsForUser(guildId, discordId),
    ]);
    return isCoord || memberships.length > 0;
  }

  @SentryTraced()
  public async assertCoordinator(
    guildId: string,
    discordId: string,
  ): Promise<void> {
    const authorized = await this.isCoordinator(guildId, discordId);
    if (!authorized) {
      throw new Error('You do not have permission to use this command.');
    }
  }

  @SentryTraced()
  public async assertHelperOrCoordinator(
    guildId: string,
    discordId: string,
  ): Promise<void> {
    const authorized = await this.canUseHelperSelfService(guildId, discordId);
    if (!authorized) {
      throw new Error('You do not have permission to use this command.');
    }
  }
}
