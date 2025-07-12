import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';

export interface CommandInfo {
  name: string;
  description: string;
  permissionLevel: 'public' | 'manageGuild' | 'administrator';
  subcommands?: string[];
}

export function getCommandPermissionLevel(
  defaultMemberPermissions: bigint | null,
): 'public' | 'manageGuild' | 'administrator' {
  if (!defaultMemberPermissions) {
    return 'public';
  }

  const permissions = new PermissionsBitField(defaultMemberPermissions);

  if (permissions.has(PermissionFlagsBits.Administrator)) {
    return 'administrator';
  }

  if (permissions.has(PermissionFlagsBits.ManageGuild)) {
    return 'manageGuild';
  }

  return 'public';
}

export function getAvailableCommands(): CommandInfo[] {
  return [
    // Public commands
    {
      name: 'help',
      description: 'Display a list of all available bot commands',
      permissionLevel: 'public',
    },
    {
      name: 'status',
      description: 'Retrieve the status of your current signups',
      permissionLevel: 'public',
    },
    {
      name: 'signup',
      description: 'Sign up for encounters',
      permissionLevel: 'public',
    },
    {
      name: 'remove-signup',
      description: 'Remove your signup from encounters',
      permissionLevel: 'public',
    },

    // Manage Guild commands
    {
      name: 'settings',
      description: 'Configure/Review the bots roles and channel settings',
      permissionLevel: 'manageGuild',
      subcommands: [
        'channels',
        'reviewer',
        'encounter-roles',
        'spreadsheet',
        'turbo-prog',
        'view',
      ],
    },

    // Administrator commands
    {
      name: 'blacklist',
      description: 'Manage the blacklist',
      permissionLevel: 'administrator',
      subcommands: ['add', 'remove', 'display'],
    },
    {
      name: 'encounters',
      description: 'Manage encounter prog points and thresholds',
      permissionLevel: 'administrator',
      subcommands: ['set-thresholds', 'manage-prog-points', 'view'],
    },
    {
      name: 'final-push',
      description: 'Signup for the final push event',
      permissionLevel: 'administrator',
    },
    {
      name: 'lookup',
      description:
        'Lookup a players signup information, including availability, encounters, etc.',
      permissionLevel: 'administrator',
    },
    {
      name: 'remove-role',
      description: 'Remove the selected role from all guild members',
      permissionLevel: 'administrator',
    },
    {
      name: 'retire',
      description: 'Retire all members of the current helper role',
      permissionLevel: 'administrator',
    },
    {
      name: 'search',
      description: 'Search for users by encounter and prog point',
      permissionLevel: 'administrator',
    },
    {
      name: 'turbo-prog',
      description: 'Signup for the current turbo prog event',
      permissionLevel: 'administrator',
    },
  ];
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
