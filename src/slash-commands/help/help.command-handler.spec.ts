import { createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Colors, PermissionsBitField } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpCommand } from './help.command.js';
import { HelpCommandHandler } from './help.command-handler.js';

describe('HelpCommandHandler', () => {
  let handler: HelpCommandHandler;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [HelpCommandHandler],
    })
      .useMocker(createMock)
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
    ): ChatInputCommandInteraction<'cached' | 'raw'> => {
      const deferReply = vi.fn().mockResolvedValue(undefined);
      const editReply = vi.fn().mockResolvedValue(undefined);

      const mockData: any = {
        deferReply,
        editReply,
      };

      if (hasPermissions) {
        mockData.memberPermissions = new PermissionsBitField(permissions);
      } else {
        mockData.memberPermissions = null;
      }

      return createMock<ChatInputCommandInteraction<'cached' | 'raw'>>(
        mockData,
      );
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
                  value: expect.stringContaining('**/help**'),
                  inline: false,
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
                text: expect.stringContaining('Showing 5 available commands'),
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

    it('should format commands with subcommands correctly', async () => {
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
                  name: '⚙️ Management Commands',
                  value: expect.stringMatching(
                    /\*\*\/settings\*\*.*\n└ Subcommands:.*channels.*reviewer/s,
                  ),
                }),
                expect.objectContaining({
                  name: '🔒 Administrator Commands',
                  value: expect.stringMatching(
                    /\*\*\/blacklist\*\*.*\n└ Subcommands:.*add.*remove.*display/s,
                  ),
                }),
              ]),
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
