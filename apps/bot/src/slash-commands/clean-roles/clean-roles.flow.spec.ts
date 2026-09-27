import { Encounter, PartyStatus, SignupStatus } from '@ulti-project/shared';
import { PermissionFlagsBits } from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import {
  commandErrorReply,
  expectCommandErrorReported,
  privateReply,
  textReply,
} from '../../test-utils/replies.js';
import { seedSignup } from '../../test-utils/signups.js';

const GUILD = 'guild-1';
const SETTINGS_PATH = `settings/${GUILD}`;
const DMU_PROG = Object.freeze({ id: 'dmu-prog-role', name: 'DMU Prog' });
const DMU_CLEAR = Object.freeze({ id: 'dmu-clear-role', name: 'DMU Clear' });
const DMU_P6 = Object.freeze({ id: 'dmu-p6-role', name: 'DMU P6' });
const TOP_PROG = Object.freeze({ id: 'top-prog-role', name: 'TOP Prog' });
const OTHER_ROLE = 'other-role';

/** Every role the bot hands out for DMU and TOP, as configured. */
const ROLE_SETTINGS = Object.freeze({
  progRoles: { DMU: DMU_PROG.id, TOP: TOP_PROG.id },
  clearRoles: { DMU: DMU_CLEAR.id },
  progPointRoles: { DMU: { P6: DMU_P6.id } },
});

const ADMIN = Object.freeze({
  id: 'admin-1',
  username: 'admin',
  permissions: PermissionFlagsBits.Administrator,
});
/** In a prog party with an approved signup. */
const ACTIVE = Object.freeze({
  id: 'active-1',
  username: 'active',
  displayName: 'Active Nick',
  roles: Object.freeze([DMU_PROG.id, DMU_P6.id, OTHER_ROLE]),
});
/** Kept their roles after their signup lapsed. */
const LAPSED = Object.freeze({
  id: 'lapsed-1',
  username: 'lapsed',
  displayName: 'Lapsed Nick',
  roles: Object.freeze([DMU_PROG.id, DMU_CLEAR.id, OTHER_ROLE]),
});

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      const flow = await createFlowApp();
      flow.discord.addChannel(GUILD, 'general');
      for (const role of [DMU_PROG, DMU_CLEAR, DMU_P6, TOP_PROG]) {
        flow.discord.addRole(GUILD, role);
      }
      flow.discord.addRole(GUILD, { id: OTHER_ROLE, name: 'Other' });
      flow.discord.addMember(ADMIN);
      flow.discord.addMember(ACTIVE);
      flow.discord.addMember(LAPSED);
      flow.db.seed(SETTINGS_PATH, ROLE_SETTINGS);
      seedSignup(flow, {
        discordId: ACTIVE.id,
        encounter: Encounter.DMU,
        status: SignupStatus.APPROVED,
        progPoint: 'P6',
        partyStatus: PartyStatus.ProgParty,
      });
      seedSignup(flow, {
        discordId: LAPSED.id,
        encounter: Encounter.DMU,
        status: SignupStatus.DECLINED,
      });
      return flow;
    },
    (flow) => flow.close(),
  ),
});

/** The admin runs /clean-roles; returns what they were shown. */
async function cleanRoles(
  flow: FlowApp,
  { dryRun }: { dryRun?: boolean } = {},
) {
  flow.discord.command({
    userId: ADMIN.id,
    guildId: GUILD,
    commandName: 'clean-roles',
    options: dryRun === undefined ? {} : { 'dry-run': dryRun },
  });
  await flow.settle();
  return flow.discord.repliesTo(ADMIN.id).map(shown);
}

const summary = (...lines: string[]) => [
  textReply(ADMIN.id, ['## Clean Roles Summary', '', ...lines].join('\n'), {
    ephemeral: true,
  }),
];

describe('Clean roles', () => {
  describe('when an admin cleans roles', () => {
    it.beforeEach(({ flow }) => cleanRoles(flow));

    it('takes the configured roles from members without an active signup, and no others', ({
      flow,
    }) => {
      expect([
        flow.discord.rolesOf(ACTIVE.id),
        flow.discord.rolesOf(LAPSED.id),
      ]).toEqual([[DMU_PROG.id, DMU_P6.id, OTHER_ROLE], [OTHER_ROLE]]);
    });

    it('tells the admin, privately, what it removed from each role', ({
      flow,
    }) => {
      expect(flow.discord.repliesTo(ADMIN.id).map(shown)).toEqual(
        summary(
          '**Total Roles Processed:** 4',
          '**Total Members Processed:** 4',
          '**Total Roles Removed:** 2',
          '',
          '**Role Details:**',
          '• **DMU Prog**: 1/2 removed',
          '• **TOP Prog**: No members had this role',
          '• **DMU Clear**: 1/1 removed',
          '• **DMU P6**: 0/1 removed (all have active signups)',
          '',
          '✅ Role cleanup completed successfully!',
        ),
      );
    });
  });

  describe('when every member with a role has an active signup', () => {
    it('removes nothing and says so', async ({ flow }) => {
      flow.discord.addMember({ ...LAPSED, roles: [OTHER_ROLE] });

      expect(await cleanRoles(flow)).toEqual(
        summary(
          '**Total Roles Processed:** 4',
          '**Total Members Processed:** 2',
          '**Total Roles Removed:** 0',
          '',
          '**Role Details:**',
          '• **DMU Prog**: 0/1 removed (all have active signups)',
          '• **TOP Prog**: No members had this role',
          '• **DMU Clear**: No members had this role',
          '• **DMU P6**: 0/1 removed (all have active signups)',
          '',
          '✅ All members with clear/prog roles have active signups!',
        ),
      );
    });
  });

  describe('when a configured role was deleted from the server', () => {
    it('warns about it and cleans the others', async ({ flow }) => {
      flow.db.seed(SETTINGS_PATH, {
        ...ROLE_SETTINGS,
        progRoles: { DMU: DMU_PROG.id, TOP: 'deleted-role' },
      });

      const replies = await cleanRoles(flow);

      flow.expectReported(/^warning: Role deleted-role not found in guild/);
      expect([replies, flow.discord.rolesOf(LAPSED.id)]).toEqual([
        summary(
          '**Total Roles Processed:** 3',
          '**Total Members Processed:** 4',
          '**Total Roles Removed:** 2',
          '',
          '**Role Details:**',
          '• **DMU Prog**: 1/2 removed',
          '• **DMU Clear**: 1/1 removed',
          '• **DMU P6**: 0/1 removed (all have active signups)',
          '',
          '✅ Role cleanup completed successfully!',
        ),
        [OTHER_ROLE],
      ]);
    });
  });

  describe('when only prog point roles are configured', () => {
    it('cleans those', async ({ flow }) => {
      flow.db.seed(SETTINGS_PATH, {
        progPointRoles: ROLE_SETTINGS.progPointRoles,
      });
      flow.discord.addMember({ ...LAPSED, roles: [DMU_P6.id] });

      const replies = await cleanRoles(flow);

      expect([replies, flow.discord.rolesOf(LAPSED.id)]).toEqual([
        summary(
          '**Total Roles Processed:** 1',
          '**Total Members Processed:** 2',
          '**Total Roles Removed:** 1',
          '',
          '**Role Details:**',
          '• **DMU P6**: 1/2 removed',
          '',
          '✅ Role cleanup completed successfully!',
        ),
        [],
      ]);
    });
  });

  describe('when every configured role was deleted from the server', () => {
    it('warns about each and cleans nothing', async ({ flow }) => {
      flow.db.seed(SETTINGS_PATH, { progRoles: { DMU: 'deleted-role' } });

      const replies = await cleanRoles(flow);

      flow.expectReported(/^warning: Role deleted-role not found in guild/);
      expect(replies).toEqual(
        summary(
          '**Total Roles Processed:** 0',
          '**Total Members Processed:** 0',
          '**Total Roles Removed:** 0',
          '',
          '✅ All members with clear/prog roles have active signups!',
        ),
      );
    });
  });

  describe('when the bot may not remove one of the roles', () => {
    it('reports each member it failed, and leaves them the role', async ({
      flow,
    }) => {
      flow.discord.addRole(GUILD, { ...DMU_CLEAR, aboveBot: true });

      await cleanRoles(flow);

      flow.expectReported(
        /^error: DiscordAPIError\[50013\]: Missing Permissions.*Failed to process member Lapsed Nick \(lapsed-1\) for role DMU Clear/s,
      );
      flow.expectReported(
        /^Sentry exception: DiscordAPIError\[50013\]: Missing Permissions/,
      );
      expect(flow.discord.rolesOf(LAPSED.id)).toEqual([
        DMU_CLEAR.id,
        OTHER_ROLE,
      ]);
    });
  });

  describe('when an admin previews a clean-up', () => {
    const preview = (fields: unknown[]) => [
      privateReply(ADMIN.id, {
        embeds: [
          {
            title: '🔍 Clean Roles - Dry Run Preview',
            color: 0x3498db,
            fields,
            footer: {
              text: '💡 Run without --dry-run to execute these changes',
            },
          },
        ],
      }),
    ];

    const field = (name: string, value: string) => ({
      name,
      value,
      inline: false,
    });

    it('lists who would lose which role, and changes nothing', async ({
      flow,
    }) => {
      const replies = await cleanRoles(flow, { dryRun: true });

      expect([replies, flow.discord.rolesOf(LAPSED.id)]).toEqual([
        preview([
          field(
            '📊 Processing Summary',
            '**Roles Processed:** 4\n**Role Assignments Processed:** 4\n**Role Assignments to Remove:** 2',
          ),
          field(
            '👥 Member Analysis',
            '**Total Active Signups:** 1\n**Members with Roles (Before):** 2\n**Members with Roles (After):** 1\n**Members to Lose Roles:** 1',
          ),
          field(
            '✅ Validation Check',
            'Expected: Members after removal should match or be less than active signups\n**Expected Result:** Members with roles after cleanup ≤ Active signups\n**Actual Result:** 1 ≤ 1 = PASS',
          ),
          field('🎭 DMU Prog (1 removals)', `• <@${LAPSED.id}> (Lapsed Nick)`),
          field('🎭 DMU Clear (1 removals)', `• <@${LAPSED.id}> (Lapsed Nick)`),
        ]),
        [DMU_PROG.id, DMU_CLEAR.id, OTHER_ROLE],
      ]);
    });

    it('says no change is needed when everyone with a role is active', async ({
      flow,
    }) => {
      flow.discord.addMember({ ...LAPSED, roles: [OTHER_ROLE] });

      expect(await cleanRoles(flow, { dryRun: true })).toEqual(
        preview([
          field(
            '📊 Processing Summary',
            '**Roles Processed:** 4\n**Role Assignments Processed:** 2\n**Role Assignments to Remove:** 0',
          ),
          field(
            '👥 Member Analysis',
            '**Total Active Signups:** 1\n**Members with Roles (Before):** 1\n**Members with Roles (After):** 1\n**Members to Lose Roles:** 0',
          ),
          field(
            '✅ Validation Check',
            'Expected: Members after removal should match or be less than active signups\n**Expected Result:** Members with roles after cleanup ≤ Active signups\n**Actual Result:** 1 ≤ 1 = PASS',
          ),
          field(
            '✅ No Changes Required',
            'All members with clear/prog roles have active signups!',
          ),
        ]),
      );
    });

    it('lists ten members per role, and counts the rest', async ({ flow }) => {
      const lapsed = Array.from({ length: 11 }, (_, i) => `lapsed-${i + 10}`);
      for (const id of lapsed) {
        flow.discord.addMember({ id, username: id, roles: [TOP_PROG.id] });
      }

      expect(await cleanRoles(flow, { dryRun: true })).toEqual(
        preview([
          field(
            '📊 Processing Summary',
            '**Roles Processed:** 4\n**Role Assignments Processed:** 15\n**Role Assignments to Remove:** 13',
          ),
          field(
            '👥 Member Analysis',
            '**Total Active Signups:** 1\n**Members with Roles (Before):** 13\n**Members with Roles (After):** 1\n**Members to Lose Roles:** 12',
          ),
          field(
            '✅ Validation Check',
            'Expected: Members after removal should match or be less than active signups\n**Expected Result:** Members with roles after cleanup ≤ Active signups\n**Actual Result:** 1 ≤ 1 = PASS',
          ),
          field('🎭 DMU Prog (1 removals)', `• <@${LAPSED.id}> (Lapsed Nick)`),
          field(
            '🎭 TOP Prog (11 removals)',
            [
              ...lapsed.slice(0, 10).map((id) => `• <@${id}> (${id})`),
              '... and 1 more',
            ].join('\n'),
          ),
          field('🎭 DMU Clear (1 removals)', `• <@${LAPSED.id}> (Lapsed Nick)`),
        ]),
      );
    });
  });

  describe('when no roles are configured', () => {
    it.for([
      ['no role settings', {}],
      ['only empty role settings', { progRoles: {} }],
    ] as const)(
      'replies with a command error, with %s',
      async ([, settings], { flow }) => {
        flow.db.seed(SETTINGS_PATH, settings);

        const replies = await cleanRoles(flow);

        expectCommandErrorReported(flow, 'No clear/prog roles');
        expect(replies).toEqual([commandErrorReply(flow, ADMIN.id)]);
      },
    );
  });
});
