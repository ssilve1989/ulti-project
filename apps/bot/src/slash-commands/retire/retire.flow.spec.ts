import { Colors, PermissionFlagsBits } from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import { isoDateSince } from '../../test-utils/matchers.js';
import { replyTo } from '../../test-utils/replies.js';

const GUILD = 'guild-1';
const HELPER_ROLE = Object.freeze({ id: 'helper-role', name: 'Helper' });
const RETIRED_ROLE = Object.freeze({
  id: 'retired-role',
  name: 'Retired Helper',
});
const OTHER_ROLE = 'other-role';

const ADMIN = Object.freeze({
  id: 'admin-1',
  username: 'admin',
  permissions: PermissionFlagsBits.Administrator,
});
const HELPERS = Object.freeze(['helper-1', 'helper-2']);
const NOT_A_HELPER = 'member-1';

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      const flow = await createFlowApp();
      flow.discord.addChannel(GUILD, 'general');
      flow.discord.addRole(GUILD, HELPER_ROLE);
      flow.discord.addRole(GUILD, RETIRED_ROLE);
      flow.discord.addRole(GUILD, { id: OTHER_ROLE, name: 'Other' });
      flow.discord.addMember(ADMIN);
      for (const id of HELPERS) {
        flow.discord.addMember({
          id,
          username: id,
          roles: [HELPER_ROLE.id, OTHER_ROLE],
        });
      }
      flow.discord.addMember({
        id: NOT_A_HELPER,
        username: NOT_A_HELPER,
        roles: [OTHER_ROLE],
      });
      return flow;
    },
    (flow) => flow.close(),
  ),
});

/** The admin runs /retire; returns what they were shown. */
async function retire(
  flow: FlowApp,
  { from, to }: { from: string; to: string },
) {
  flow.discord.command({
    userId: ADMIN.id,
    guildId: GUILD,
    commandName: 'retire',
    options: { 'current-helper-role': from, 'retired-helper-role': to },
  });
  await flow.settle();
  return flow.discord.repliesTo(ADMIN.id).map(shown);
}

const privateEmbed = (embed: object) => [
  {
    location: replyTo(ADMIN.id, { ephemeral: true }),
    reactions: {},
    deleted: false,
    content: undefined,
    embeds: [embed],
    components: [],
  },
];

/** The summary of a retirement: how many members held the role, and how many were moved. */
const summary = (
  flow: FlowApp,
  { total, moved, failed }: { total: number; moved: number; failed: number },
) =>
  privateEmbed({
    title: 'Role Retirement Complete',
    description: 'Replaced Helper with Retired Helper',
    color: failed > 0 ? Colors.Yellow : Colors.Green,
    timestamp: isoDateSince(flow.startedAt),
    fields: [
      { name: 'Total members processed', value: `${total}`, inline: true },
      { name: 'Successful updates', value: `${moved}`, inline: true },
      { name: 'Failed updates', value: `${failed}`, inline: true },
    ],
  });

const rolesOfEveryone = (flow: FlowApp) =>
  [...HELPERS, NOT_A_HELPER].map((id) => flow.discord.rolesOf(id));

describe('Retire', () => {
  describe('when an admin retires the helper role', () => {
    it.beforeEach(({ flow }) =>
      retire(flow, { from: HELPER_ROLE.id, to: RETIRED_ROLE.id }),
    );

    it('moves every helper to the retired role, touching nothing else', ({
      flow,
    }) => {
      expect(rolesOfEveryone(flow)).toEqual([
        [OTHER_ROLE, RETIRED_ROLE.id],
        [OTHER_ROLE, RETIRED_ROLE.id],
        [OTHER_ROLE],
      ]);
    });

    it('tells the admin, privately, how many were moved', ({ flow }) => {
      expect(flow.discord.repliesTo(ADMIN.id).map(shown)).toEqual(
        summary(flow, { total: 2, moved: 2, failed: 0 }),
      );
    });
  });

  describe('when nobody holds the helper role', () => {
    it('says no member was processed', async ({ flow }) => {
      expect(
        await retire(flow, { from: RETIRED_ROLE.id, to: HELPER_ROLE.id }),
      ).toEqual(
        privateEmbed({
          title: 'Role Retirement Complete',
          description: 'Replaced Retired Helper with Helper',
          color: Colors.Green,
          timestamp: isoDateSince(flow.startedAt),
          fields: [
            { name: 'Total members processed', value: '0', inline: true },
            { name: 'Successful updates', value: '0', inline: true },
            { name: 'Failed updates', value: '0', inline: true },
          ],
        }),
      );
    });
  });

  describe('when the admin picks the same role twice', () => {
    it('refuses, changing no roles', async ({ flow }) => {
      const replies = await retire(flow, {
        from: HELPER_ROLE.id,
        to: HELPER_ROLE.id,
      });

      expect([replies, rolesOfEveryone(flow)]).toEqual([
        privateEmbed({
          title: 'Role Retirement',
          description:
            'The current and retired helper roles cannot be the same.',
          color: Colors.Red,
        }),
        [
          [HELPER_ROLE.id, OTHER_ROLE],
          [HELPER_ROLE.id, OTHER_ROLE],
          [OTHER_ROLE],
        ],
      ]);
    });
  });

  describe('when the bot may not give out the retired role', () => {
    it.beforeEach(async ({ flow }) => {
      flow.discord.addRole(GUILD, { ...RETIRED_ROLE, aboveBot: true });
      await retire(flow, { from: HELPER_ROLE.id, to: RETIRED_ROLE.id });
    });

    it('reports each helper it failed to move, and counts them as failed', ({
      flow,
    }) => {
      for (const helper of HELPERS) {
        flow.expectReported(
          new RegExp(
            `^error: DiscordAPIError\\[50013\\]: Missing Permissions.*Failed to update roles for member ${helper}`,
            's',
          ),
        );
      }
      expect(flow.discord.repliesTo(ADMIN.id).map(shown)).toEqual(
        summary(flow, { total: 2, moved: 0, failed: 2 }),
      );
    });
  });
});
