import {
  ApplicationCommandOptionType,
  PermissionFlagsBits,
  PermissionsBitField,
} from 'discord.js';
import type { SlashCommands } from '../slash-commands.provider.js';

export interface CommandInfo {
  name: string;
  description: string;
  permissionLevel: 'public' | 'manageGuild' | 'administrator';
  subcommands?: string[];
}

export function getCommandPermissionLevel(
  defaultMemberPermissions: string | null | undefined,
): 'public' | 'manageGuild' | 'administrator' {
  if (!defaultMemberPermissions) {
    return 'public';
  }

  const permissions = new PermissionsBitField(BigInt(defaultMemberPermissions));

  if (permissions.has(PermissionFlagsBits.Administrator)) {
    return 'administrator';
  }

  if (permissions.has(PermissionFlagsBits.ManageGuild)) {
    return 'manageGuild';
  }

  return 'public';
}

function extractSubcommands(
  command: ReturnType<SlashCommands[0]['toJSON']>,
): string[] {
  const subcommands: string[] = [];

  if (command.options) {
    for (const option of command.options) {
      if (option.type === ApplicationCommandOptionType.Subcommand) {
        subcommands.push(option.name);
      }
    }
  }

  return subcommands;
}

export function getAvailableCommands(
  slashCommands: SlashCommands,
): CommandInfo[] {
  return slashCommands
    .filter((command) => command.name !== 'help') // Exclude help command itself
    .map((command) => {
      const commandData = command.toJSON();
      const subcommands = extractSubcommands(commandData);

      return {
        name: commandData.name,
        description: commandData.description,
        subcommands: subcommands.length > 0 ? subcommands : undefined,
        permissionLevel: getCommandPermissionLevel(
          commandData.default_member_permissions,
        ),
      };
    });
}

export function filterCommandsByPermissions(
  commands: CommandInfo[],
  isAdmin: boolean,
  canManageGuild: boolean,
): CommandInfo[] {
  return commands.filter((command) => {
    switch (command.permissionLevel) {
      case 'public':
        return true;
      case 'manageGuild':
        return canManageGuild || isAdmin;
      case 'administrator':
        return isAdmin;
      default:
        return false;
    }
  });
}
