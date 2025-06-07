import { createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, Colors } from 'discord.js';
import { DiscordService } from '../../discord/discord.service.js';
import { RetireCommandHandler } from './retire.command-handler.js';
import { RetireCommand } from './retire.command.js';

describe('RetireCommandHandler', () => {
  let handler: RetireCommandHandler;
  let discordService: DiscordService;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [RetireCommandHandler],
    })
      .useMocker(createMock)
      .compile();

    handler = fixture.get(RetireCommandHandler);
    discordService = fixture.get(DiscordService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('execute', () => {
    // Helper function to create interaction mock
    const createInteractionMock = (
      options: {
        inGuild?: boolean;
        guildId?: string;
        currentRoleId?: string;
        currentRoleName?: string;
        retiredRoleId?: string;
        retiredRoleName?: string;
      } = {},
    ) => {
      const {
        inGuild = true,
        guildId = 'guild-123',
        currentRoleId = '111111',
        currentRoleName = 'CurrentHelperRole',
        retiredRoleId = '222222',
        retiredRoleName = 'RetiredHelperRole',
      } = options;

      const deferReply = vi.fn().mockResolvedValue(undefined);
      const editReply = vi.fn().mockResolvedValue(undefined);

      return {
        mock: createMock<ChatInputCommandInteraction<'cached'>>({
          deferReply,
          editReply,
          guildId,
          inGuild: () => inGuild,
          options: {
            getRole: (name: string) => {
              if (name === 'current-helper-role') {
                return {
                  id: currentRoleId,
                  name: currentRoleName,
                };
              }
              return {
                id: retiredRoleId,
                name: retiredRoleName,
              };
            },
          },
          valueOf: () => '',
        }),
        deferReply,
        editReply,
      };
    };

    // Test cases
    it('should do nothing if not in a guild', async () => {
      const { mock, deferReply } = createInteractionMock({ inGuild: false });
      await handler.execute(new RetireCommand(mock));
      expect(deferReply).not.toHaveBeenCalled();
    });

    it('should reject if source and destination roles are the same', async () => {
      const { mock, editReply } = createInteractionMock({
        currentRoleId: 'same-id',
        retiredRoleId: 'same-id',
      });

      await handler.execute(new RetireCommand(mock));

      expect(editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Role Retirement',
              description:
                'The current and retired helper roles cannot be the same.',
              color: Colors.Red,
            }),
          }),
        ],
      });
    });

    it('should indicate when no members have the role', async () => {
      const { mock, editReply } = createInteractionMock();

      discordService.retireRole = vi.fn().mockResolvedValue({
        totalMembers: 0,
        successCount: 0,
        failCount: 0,
      });

      await handler.execute(new RetireCommand(mock));

      expect(discordService.retireRole).toHaveBeenCalledWith(
        'guild-123',
        '111111',
        '222222',
      );

      expect(editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Role Retirement Complete',
              color: Colors.Green,
              fields: expect.arrayContaining([
                { name: 'Total members processed', value: '0', inline: true },
              ]),
            }),
          }),
        ],
      });
    });

    it('should update roles for all members with the source role', async () => {
      const { mock, editReply } = createInteractionMock();

      discordService.retireRole = vi.fn().mockResolvedValue({
        totalMembers: 2,
        successCount: 2,
        failCount: 0,
      });

      await handler.execute(new RetireCommand(mock));

      expect(discordService.retireRole).toHaveBeenCalledWith(
        'guild-123',
        '111111',
        '222222',
      );

      expect(editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Role Retirement Complete',
              description: 'Replaced CurrentHelperRole with RetiredHelperRole',
              fields: [
                { name: 'Total members processed', value: '2', inline: true },
                { name: 'Successful updates', value: '2', inline: true },
                { name: 'Failed updates', value: '0', inline: true },
              ],
              color: Colors.Green,
            }),
          }),
        ],
      });
    });

    it('should handle errors during role updates', async () => {
      const { mock, editReply } = createInteractionMock();

      discordService.retireRole = vi.fn().mockResolvedValue({
        totalMembers: 2,
        successCount: 1,
        failCount: 1,
      });

      await handler.execute(new RetireCommand(mock));

      expect(editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Role Retirement Complete',
              color: Colors.Yellow, // Yellow because there was a failure
              fields: expect.arrayContaining([
                { name: 'Failed updates', value: '1', inline: true },
              ]),
            }),
          }),
        ],
      });
    });

    it('should handle unexpected errors gracefully', async () => {
      const { mock, editReply } = createInteractionMock();

      discordService.retireRole = vi
        .fn()
        .mockRejectedValue(new Error('Something went wrong'));

      await handler.execute(new RetireCommand(mock));

      expect(editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Role Retirement Failed',
              description:
                'An error occurred while processing role retirement.',
              color: Colors.Red,
            }),
          }),
        ],
      });
    });
  });
});
