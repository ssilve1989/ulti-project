import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import { DiscordService } from '../discord/discord.service.js';
import { SettingsCollection } from '../firebase/collections/settings-collection.js';
import { createAutoMock } from '../test-utils/mock-factory.js';
import { HelperTeamAuthorizationService } from './helper-team-authorization.service.js';
import { HelperTeamMembershipService } from './helper-team-membership.service.js';

describe('HelperTeamAuthorizationService', () => {
  let service: HelperTeamAuthorizationService;
  let settingsCollection: Mocked<SettingsCollection>;
  let discordService: Mocked<DiscordService>;
  let membershipService: Mocked<HelperTeamMembershipService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [HelperTeamAuthorizationService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(HelperTeamAuthorizationService);
    settingsCollection = fixture.get(SettingsCollection);
    discordService = fixture.get(DiscordService);
    membershipService = fixture.get(HelperTeamMembershipService);
  });

  describe('isCoordinator', () => {
    it('returns true when user has coordinator role', async () => {
      settingsCollection.getSettings.mockResolvedValueOnce({
        coordinatorRole: 'coord-role-id',
      });
      discordService.userHasRole.mockResolvedValueOnce(true);

      const result = await service.isCoordinator('guild-id', 'user-id');
      expect(result).toBe(true);
    });

    it('returns false when no coordinator role is configured', async () => {
      settingsCollection.getSettings.mockResolvedValueOnce({});

      const result = await service.isCoordinator('guild-id', 'user-id');
      expect(result).toBe(false);
    });
  });

  describe('canUseHelperSelfService', () => {
    it('returns true when user has at least one team membership', async () => {
      settingsCollection.getSettings.mockResolvedValueOnce({
        coordinatorRole: 'coord-role-id',
      });
      membershipService.getMembershipsForUser.mockResolvedValueOnce([
        {
          teamId: 'alpha',
          roleName: 'Alpha',
          memberRoleId: 'mr',
          leaderUserId: 'leader-user-id',
          role: 'member',
        },
      ]);

      const result = await service.canUseHelperSelfService(
        'guild-id',
        'user-id',
      );
      expect(result).toBe(true);
    });

    it('returns false when user has no team memberships and is not coordinator', async () => {
      settingsCollection.getSettings.mockResolvedValueOnce({
        coordinatorRole: 'coord-role-id',
      });
      membershipService.getMembershipsForUser.mockResolvedValueOnce([]);

      const result = await service.canUseHelperSelfService(
        'guild-id',
        'user-id',
      );
      expect(result).toBe(false);
    });
  });

  describe('assertCoordinator', () => {
    it('throws when user is not coordinator', async () => {
      settingsCollection.getSettings.mockResolvedValue({
        coordinatorRole: 'coord-role-id',
      });

      await expect(
        service.assertCoordinator('guild-id', 'non-coordinator'),
      ).rejects.toThrow('You do not have permission to use this command.');
    });
  });

  describe('assertHelperOrCoordinator', () => {
    it('throws when user has no memberships and is not coordinator', async () => {
      settingsCollection.getSettings.mockResolvedValue({
        coordinatorRole: 'coord-role-id',
      });
      membershipService.getMembershipsForUser.mockResolvedValue([]);

      await expect(
        service.assertHelperOrCoordinator('guild-id', 'random-user'),
      ).rejects.toThrow('You do not have permission to use this command.');
    });
  });
});
