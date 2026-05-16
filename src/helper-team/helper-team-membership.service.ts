import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { DiscordService } from '../discord/discord.service.js';
import { HelperTeamCollection } from '../firebase/collections/helper-team.collection.js';

export interface HelperTeamMembership {
  teamId: string;
  roleName: string;
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

    const userTeams = teams.filter((team) => {
      const isLeader = discordId === team.leaderUserId;
      const isMember = member.roles.cache.has(team.memberRoleId);
      return isLeader || isMember;
    });

    const roleNames = await Promise.all(
      userTeams.map((t) =>
        this.discordService.getRoleName({ guildId, roleId: t.memberRoleId }),
      ),
    );

    return userTeams.map((team, i) => ({
      teamId: team.teamId,
      roleName: roleNames[i],
      memberRoleId: team.memberRoleId,
      leaderUserId: team.leaderUserId,
      role: discordId === team.leaderUserId ? 'leader' : 'member',
    }));
  }
}
