import { Colors, PermissionFlagsBits } from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import { isoDateSince } from '../../test-utils/matchers.js';
import { privateReply } from '../../test-utils/replies.js';

const GUILD = 'guild-1';
const PLAYER = Object.freeze({ id: 'player-1', username: 'player' });
const MANAGER = Object.freeze({
  id: 'manager-1',
  username: 'manager',
  permissions: PermissionFlagsBits.ManageGuild,
});
const ADMIN = Object.freeze({
  id: 'admin-1',
  username: 'admin',
  permissions: PermissionFlagsBits.Administrator,
});

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      const flow = await createFlowApp();
      flow.discord.addChannel(GUILD, 'general');
      for (const member of [PLAYER, MANAGER, ADMIN]) {
        flow.discord.addMember(member);
      }
      return flow;
    },
    (flow) => flow.close(),
  ),
});

/** `userId` runs /help; returns what they were shown. */
async function help(flow: FlowApp, userId: string) {
  flow.discord.command({ userId, guildId: GUILD, commandName: 'help' });
  await flow.settle();
  return flow.discord.repliesTo(userId).map(shown);
}

const PUBLIC_COMMANDS = Object.freeze({
  name: '🔓 Public Commands',
  value: [
    '**/remove-signup** - Remove a signup',
    '**/signup** - Signup for an ultimate prog/clear party!',
    '**/status** - Retrieve the status of your current signups',
  ].join('\n'),
  inline: false,
});

const MANAGEMENT_COMMANDS = Object.freeze({
  name: '⚙️ Management Commands',
  value:
    '**/settings** - Configure/Review the bots roles and channel settings\n└ Subcommands: `blacklist-channels`, `channels`, `reviewer`, `encounter-roles`, `prog-point-roles`, `spreadsheet`, `view`',
  inline: false,
});

const ADMINISTRATOR_COMMANDS = Object.freeze({
  name: '🔒 Administrator Commands',
  value: [
    '**/blacklist** - Manage the blacklist\n└ Subcommands: `add`, `remove`, `display`',
    '**/clean-roles** - Remove clear/prog roles from members without active signups',
    '**/encounters** - View encounter configuration\n└ Subcommands: `view`',
    '**/lookup** - lookup a players signup information, including encounters, prog points, etc.',
    '**/remove-role** - Warning! This command will remove the selected role from all guild members',
    '**/retire** - Retire all members of the current helper role',
    '**/search** - Search for users by encounter and prog point',
    '**/sync-prog-roles** - Retroactively apply prog point mapped roles for active signups',
  ].join('\n'),
  inline: false,
});

/** The private help listing `fields`, with `footer` under it. */
const helpReply = (
  flow: FlowApp,
  userId: string,
  fields: unknown[],
  footer: string,
) => [
  privateReply(userId, {
    embeds: [
      {
        title: '📚 Bot Commands Help',
        description: 'Here are the commands available to you:',
        color: Colors.Blue,
        timestamp: isoDateSince(flow.startedAt),
        fields,
        footer: { text: footer },
      },
    ],
  }),
];

describe('Help', () => {
  describe('when a member without special permissions asks for help', () => {
    it('lists only the public commands', async ({ flow }) => {
      expect(await help(flow, PLAYER.id)).toEqual(
        helpReply(
          flow,
          PLAYER.id,
          [PUBLIC_COMMANDS],
          'Showing 3 available commands',
        ),
      );
    });
  });

  describe('when a member who can manage the server asks for help', () => {
    it('lists the public and management commands', async ({ flow }) => {
      expect(await help(flow, MANAGER.id)).toEqual(
        helpReply(
          flow,
          MANAGER.id,
          [PUBLIC_COMMANDS, MANAGEMENT_COMMANDS],
          'Showing 4 available commands • You have Manage Guild permissions',
        ),
      );
    });
  });

  describe('when an administrator asks for help', () => {
    it('lists every command', async ({ flow }) => {
      expect(await help(flow, ADMIN.id)).toEqual(
        helpReply(
          flow,
          ADMIN.id,
          [PUBLIC_COMMANDS, MANAGEMENT_COMMANDS, ADMINISTRATOR_COMMANDS],
          'Showing 12 available commands • You have Administrator permissions',
        ),
      );
    });
  });
});
