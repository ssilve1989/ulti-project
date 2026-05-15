import { Test } from '@nestjs/testing';
import type { GuildMember } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import { DiscordService } from '../discord/discord.service.js';
import { HelperTeamCollection } from '../firebase/collections/helper-team.collection.js';
import { createAutoMock } from '../test-utils/mock-factory.js';
import { HelperTeamMembershipService } from './helper-team-membership.service.js';

describe('HelperTeamMembershipService', () => {
  let service: HelperTeamMembershipService;
  let helperTeamCollection: Mocked<HelperTeamCollection>;
  let discordService: Mocked<DiscordService>;

  const now = Timestamp.now();

  const alphaTeam = {
    guildId: 'guild-id',
    teamId: 'alpha',
    name: 'Alpha',
    active: true,
    memberRoleId: 'alpha-member-role',
    leaderUserId: 'alpha-leader-user',
    createdAt: now,
    updatedAt: now,
  };

  const bravoTeam = {
    guildId: 'guild-id',
    teamId: 'bravo',
    name: 'Bravo',
    active: true,
    memberRoleId: 'bravo-member-role',
    leaderUserId: 'bravo-leader-user',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [HelperTeamMembershipService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(HelperTeamMembershipService);
    helperTeamCollection = fixture.get(HelperTeamCollection);
    discordService = fixture.get(DiscordService);
  });

  it('returns leader role for team where discordId matches leaderUserId', async () => {
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([
      alphaTeam,
      bravoTeam,
    ]);

    const member = {
      roles: {
        cache: {
          has: (roleId: string) => roleId === 'bravo-member-role',
        },
      },
    } as unknown as GuildMember;
    discordService.getGuildMember.mockResolvedValueOnce(member);

    const result = await service.getMembershipsForUser(
      'guild-id',
      'alpha-leader-user',
    );

    expect(result).toEqual([
      {
        teamId: 'alpha',
        teamName: 'Alpha',
        memberRoleId: 'alpha-member-role',
        leaderUserId: 'alpha-leader-user',
        role: 'leader',
      },
      {
        teamId: 'bravo',
        teamName: 'Bravo',
        memberRoleId: 'bravo-member-role',
        leaderUserId: 'bravo-leader-user',
        role: 'member',
      },
    ]);
  });

  it('returns empty array when user is not a member of any team', async () => {
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([alphaTeam]);

    const member = {
      roles: { cache: { has: () => false } },
    } as unknown as GuildMember;
    discordService.getGuildMember.mockResolvedValueOnce(member);

    const result = await service.getMembershipsForUser('guild-id', 'nobody');
    expect(result).toEqual([]);
  });

  it('returns empty array when guild member not found', async () => {
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([alphaTeam]);
    discordService.getGuildMember.mockResolvedValueOnce(undefined);

    const result = await service.getMembershipsForUser('guild-id', 'nobody');
    expect(result).toEqual([]);
  });

  it('prefers leader when discordId matches leaderUserId and user also has member role', async () => {
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([alphaTeam]);

    const member = {
      roles: { cache: { has: () => true } },
    } as unknown as GuildMember;
    discordService.getGuildMember.mockResolvedValueOnce(member);

    const result = await service.getMembershipsForUser(
      'guild-id',
      'alpha-leader-user',
    );
    expect(result[0].role).toBe('leader');
  });
});
