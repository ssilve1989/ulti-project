import { ModuleRef } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
  Colors,
  PermissionFlagsBits,
  PermissionsBitField,
  SlashCommandBuilder,
} from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { SlashCommandRegistry } from '../../slash-command-registry.service.js';
import { HelpCommandHandler } from './help.command-handler.js';

describe('HelpCommandHandler', () => {
  let command: HelpCommandHandler;

  const mockBuilders = [
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Display a list of all available bot commands'),
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Retrieve the status of your current signups'),
    new SlashCommandBuilder()
      .setName('signup')
      .setDescription('Sign up for encounters'),
    new SlashCommandBuilder()
      .setName('remove-signup')
      .setDescription('Remove your signup from encounters'),
    new SlashCommandBuilder()
      .setName('settings')
      .setDescription('Configure/Review the bots roles and channel settings')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName('blacklist')
      .setDescription('Manage the blacklist')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [HelpCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(HelpCommandHandler);

    const registry =
      createAutoMock() as unknown as Mocked<SlashCommandRegistry>;
    registry.getAllBuilders.mockReturnValue(mockBuilders);

    const moduleRef = fixture.get(ModuleRef);
    moduleRef.get = vi.fn().mockReturnValue(registry);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('execute', () => {
    const createInteractionMock = (
      permissions: bigint[] = [],
      hasPermissions = true,
    ): ChatInputCommandInteraction<'cached'> => {
      return {
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        memberPermissions: hasPermissions
          ? new PermissionsBitField(permissions)
          : null,
      } as unknown as ChatInputCommandInteraction<'cached'>;
    };

    it('should show only public commands for regular users', async () => {
      const interaction = createInteractionMock([]);

      await command.execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({
        flags: expect.any(Number),
      });
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: '📚 Bot Commands Help',
              color: Colors.Blue,
              fields: expect.arrayContaining([
                expect.objectContaining({ name: '🔓 Public Commands' }),
              ]),
            }),
          }),
        ],
      });
    });

    it('should show public and management commands for users with ManageGuild permission', async () => {
      const interaction = createInteractionMock([
        PermissionsBitField.Flags.ManageGuild,
      ]);

      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({ name: '🔓 Public Commands' }),
                expect.objectContaining({
                  name: '⚙️ Management Commands',
                  value: expect.stringContaining('**/settings**'),
                }),
              ]),
            }),
          }),
        ],
      });
    });

    it('should show all commands for administrators', async () => {
      const interaction = createInteractionMock([
        PermissionsBitField.Flags.Administrator,
      ]);

      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({ name: '🔓 Public Commands' }),
                expect.objectContaining({
                  name: '⚙️ Management Commands',
                }),
                expect.objectContaining({
                  name: '🔒 Administrator Commands',
                  value: expect.stringContaining('**/blacklist**'),
                }),
              ]),
            }),
          }),
        ],
      });
    });

    it('should handle null memberPermissions gracefully', async () => {
      const interaction = createInteractionMock([], false);

      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              fields: [expect.objectContaining({ name: '🔓 Public Commands' })],
            }),
          }),
        ],
      });
    });
  });
});
