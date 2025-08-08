import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
  Colors,
  PermissionFlagsBits,
  PermissionsBitField,
  SlashCommandBuilder,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SLASH_COMMANDS_TOKEN } from '../../slash-commands.provider.js';
import { HelpCommand } from '../commands/help.command.js';
import { HelpCommandHandler } from './help.command-handler.js';

describe('HelpCommandHandler', () => {
  let handler: HelpCommandHandler;

  const mockSlashCommands = [
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
      providers: [
        HelpCommandHandler,
        {
          provide: SLASH_COMMANDS_TOKEN,
          useValue: mockSlashCommands,
        },
      ],
    })
      .useMocker((token) => {
        if (typeof token === 'function') {
          const mockValue = vi.fn();
          const proto = token.prototype;
          if (proto) {
            Object.getOwnPropertyNames(proto).forEach(key => {
              if (key !== 'constructor') {
                mockValue[key] = vi.fn();
              }
            });
          }
          return mockValue;
        }
        return {};
      })
      .compile();

    handler = fixture.get(HelpCommandHandler);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('execute', () => {
    const createInteractionMock = (
      permissions: bigint[] = [],
      hasPermissions = true,
    ): ChatInputCommandInteraction<'cached'> => {
      const deferReply = vi.fn().mockResolvedValue(undefined);
      const editReply = vi.fn().mockResolvedValue(undefined);

      const interaction = {
        deferReply,
        editReply,
      } as any;

      // Handle the readonly property correctly
      Object.defineProperty(interaction, 'memberPermissions', {
        value: hasPermissions ? new PermissionsBitField(permissions) : null,
        writable: false,
      });

      return interaction;
    };

    it('should show only public commands for regular users', async () => {
      const interaction = createInteractionMock([]);
      const command = new HelpCommand(interaction);

      await handler.execute(command);

      expect(interaction.deferReply).toHaveBeenCalledWith({
        flags: expect.any(Number),
      });
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: '📚 Bot Commands Help',
              description: 'Here are the commands available to you:',
              color: Colors.Blue,
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: '🔓 Public Commands',
                  value: expect.stringContaining('**/status**'),
                  inline: false,
                }),
              ]),
              footer: expect.objectContaining({
                text: expect.stringContaining('Showing 3 available commands'),
              }),
            }),
          }),
        ],
      });
    });

    it('should show public and management commands for users with ManageGuild permission', async () => {
      const interaction = createInteractionMock([
        PermissionsBitField.Flags.ManageGuild,
      ]);
      const command = new HelpCommand(interaction);

      await handler.execute(command);

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: '🔓 Public Commands',
                }),
                expect.objectContaining({
                  name: '⚙️ Management Commands',
                  value: expect.stringContaining('**/settings**'),
                }),
              ]),
              footer: expect.objectContaining({
                text: expect.stringContaining('Showing 4 available commands'),
              }),
            }),
          }),
        ],
      });
    });

    it('should show all commands for administrators', async () => {
      const interaction = createInteractionMock([
        PermissionsBitField.Flags.Administrator,
      ]);
      const command = new HelpCommand(interaction);

      await handler.execute(command);

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: '🔓 Public Commands',
                }),
                expect.objectContaining({
                  name: '⚙️ Management Commands',
                }),
                expect.objectContaining({
                  name: '🔒 Administrator Commands',
                  value: expect.stringContaining('**/blacklist**'),
                }),
              ]),
              footer: expect.objectContaining({
                text: expect.stringContaining(
                  'You have Administrator permissions',
                ),
              }),
            }),
          }),
        ],
      });
    });

    it('should handle null memberPermissions gracefully', async () => {
      const interaction = createInteractionMock([], false); // No permissions object
      const command = new HelpCommand(interaction);

      await handler.execute(command);

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              fields: [
                expect.objectContaining({
                  name: '🔓 Public Commands',
                }),
              ],
            }),
          }),
        ],
      });
    });

    it('should set correct footer text for ManageGuild users', async () => {
      const interaction = createInteractionMock([
        PermissionsBitField.Flags.ManageGuild,
      ]);
      const command = new HelpCommand(interaction);

      await handler.execute(command);

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              footer: expect.objectContaining({
                text: expect.stringContaining(
                  'You have Manage Guild permissions',
                ),
              }),
            }),
          }),
        ],
      });
    });
  });
});
