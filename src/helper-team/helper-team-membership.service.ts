import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { DiscordService } from '../discord/discord.service.js';
import { HelperTeamCollection } from '../firebase/collections/helper-team.collection.js';

export interface HelperTeamMembership {
  teamId: string;
  teamName: string;
  memberRoleId: string;
  leaderUserId: string;
  role: 'member' | 'leader';
}

@Injectable()
export class HelperTeamMembershipService {
  constructor(
    private readonly helperTeamCollection: HelperTeamCollection,
    private readonly discordService: DiscordService,
  ) {}

  @SentryTraced()
  public async getMembershipsForUser(
    guildId: string,
    discordId: string,
  ): Promise<HelperTeamMembership[]> {
    const [teams, member] = await Promise.all([
      this.helperTeamCollection.getActiveForGuild(guildId),
      this.discordService.getGuildMember({ guildId, memberId: discordId }),
    ]);

    if (!member) return [];

    const memberships: HelperTeamMembership[] = [];

    for (const team of teams) {
      const isLeader = discordId === team.leaderUserId;
      const isMember = member.roles.cache.has(team.memberRoleId);

      if (isLeader || isMember) {
        memberships.push({
          teamId: team.teamId,
          teamName: team.name,
          memberRoleId: team.memberRoleId,
          leaderUserId: team.leaderUserId,
          role: isLeader ? 'leader' : 'member',
        });
      }
    }

    return memberships;
  }
}
