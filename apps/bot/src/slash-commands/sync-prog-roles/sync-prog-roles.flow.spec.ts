import {
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import { PermissionFlagsBits } from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import {
  commandErrorReply,
  expectCommandErrorReported,
  replyTo,
  textReply,
} from '../../test-utils/replies.js';
import { seedSignup } from '../../test-utils/signups.js';

const GUILD = 'guild-1';
const SETTINGS_PATH = `settings/${GUILD}`;
const P5_ROLE = 'dmu-p5-role';
const P6_ROLE = 'dmu-p6-role';

const ADMIN = Object.freeze({
  id: 'admin-1',
  username: 'admin',
  permissions: PermissionFlagsBits.Administrator,
});
/** Approved at P6, still holding the P5 role. */
const PROMOTED = 'a-promoted';
/** Approved at P7, which shares the P6 role they already hold. */
const UP_TO_DATE = 'b-up-to-date';
/** Approved at P5 before prog point roles existed. */
const NEWCOMER = 'f-newcomer';

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      const flow = await createFlowApp();
      flow.discord.addChannel(GUILD, 'general');
      flow.discord.addRole(GUILD, { id: P5_ROLE, name: 'P5' });
      flow.discord.addRole(GUILD, { id: P6_ROLE, name: 'P6' });
      flow.discord.addMember(ADMIN);
      flow.discord.addMember({
        id: PROMOTED,
        username: PROMOTED,
        roles: [P5_ROLE],
      });
      flow.discord.addMember({
        id: UP_TO_DATE,
        username: UP_TO_DATE,
        roles: [P6_ROLE],
      });
      flow.discord.addMember({ id: NEWCOMER, username: NEWCOMER });
      flow.discord.addMember({ id: 'c-cleared', username: 'c-cleared' });
      flow.discord.addMember({ id: 'd-other', username: 'd-other' });
      flow.db.seed(SETTINGS_PATH, {
        progPointRoles: { DMU: { P5: P5_ROLE, P6: P6_ROLE, P7: P6_ROLE } },
      });
      seedSignups(flow);
      return flow;
    },
    (flow) => flow.close(),
  ),
});

/** An approved DMU signup of `discordId`'s at `progPoint`. */
const approved = (
  flow: FlowApp,
  discordId: string,
  progPoint: string,
  changes: Partial<SignupDocument> = {},
) =>
  seedSignup(flow, {
    discordId,
    encounter: Encounter.DMU,
    status: SignupStatus.APPROVED,
    progPoint,
    partyStatus: PartyStatus.ProgParty,
    ...changes,
  });

function seedSignups(flow: FlowApp): void {
  approved(flow, PROMOTED, 'P6');
  approved(flow, UP_TO_DATE, 'P7');
  approved(flow, 'c-cleared', 'P6', { partyStatus: PartyStatus.Cleared });
  // TOP has no prog point roles
  approved(flow, 'd-other', 'P3', { encounter: Encounter.TOP });
  // no longer in the server
  approved(flow, 'e-left', 'P6');
  approved(flow, NEWCOMER, 'P5', { partyStatus: PartyStatus.ClearParty });
  seedSignup(flow, { discordId: 'g-pending', encounter: Encounter.DMU });
}

/** The admin runs /sync-prog-roles; returns what they were shown. */
async function syncProgRoles(
  flow: FlowApp,
  { dryRun }: { dryRun?: boolean } = {},
) {
  flow.discord.command({
    userId: ADMIN.id,
    guildId: GUILD,
    commandName: 'sync-prog-roles',
    options: dryRun === undefined ? {} : { 'dry-run': dryRun },
  });
  await flow.settle();
  return flow.discord.repliesTo(ADMIN.id).map(shown);
}

const counts = ({
  changed,
  added,
  removed,
  errors,
  changedLabel = 'Changed',
}: {
  changed: number;
  added: number;
  removed: number;
  errors: number;
  changedLabel?: string;
}) =>
  [
    '**Signups Examined:** 6',
    `**Members ${changedLabel}:** ${changed}`,
    `**Roles Added:** ${added}`,
    `**Roles Removed:** ${removed}`,
    '**Skipped (no mapping/prog point):** 1',
    '**Skipped (inactive status):** 1',
    '**Skipped (member left):** 1',
    '**Skipped (already correct):** 1',
    `**Errors:** ${errors}`,
  ].join('\n');

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

const field = (name: string, value: string) => ({
  name,
  value,
  inline: false,
});

const CHANGES = field(
  'Changes',
  [
    `<@${PROMOTED}> DMU: +<@&${P6_ROLE}> −<@&${P5_ROLE}>`,
    `<@${NEWCOMER}> DMU: +<@&${P5_ROLE}>`,
  ].join('\n'),
);

const rolesOfMembers = (flow: FlowApp) =>
  [PROMOTED, UP_TO_DATE, NEWCOMER].map((id) => flow.discord.rolesOf(id));

describe('Sync prog roles', () => {
  describe("when an admin syncs roles to active signups' prog points", () => {
    it.beforeEach(({ flow }) => syncProgRoles(flow));

    it('gives each member the role of their prog point, and takes the others', ({
      flow,
    }) => {
      expect(rolesOfMembers(flow)).toEqual([[P6_ROLE], [P6_ROLE], [P5_ROLE]]);
    });

    it('tells the admin, privately, what it changed and skipped', ({
      flow,
    }) => {
      expect(flow.discord.repliesTo(ADMIN.id).map(shown)).toEqual(
        privateEmbed({
          title: '✅ Sync Prog Roles',
          color: 0x2ecc71,
          fields: [
            field(
              'Summary',
              counts({ changed: 2, added: 2, removed: 1, errors: 0 }),
            ),
            CHANGES,
          ],
        }),
      );
    });
  });

  describe('when an admin previews a sync', () => {
    it('shows what would change, and changes nothing', async ({ flow }) => {
      const replies = await syncProgRoles(flow, { dryRun: true });

      expect([replies, rolesOfMembers(flow)]).toEqual([
        privateEmbed({
          title: '🔍 Sync Prog Roles — Dry Run',
          color: 0x3498db,
          fields: [
            field(
              'Summary',
              counts({
                changed: 2,
                added: 2,
                removed: 1,
                errors: 0,
                changedLabel: 'To Change',
              }),
            ),
            CHANGES,
          ],
          footer: { text: '💡 Run without dry-run to apply these changes' },
        }),
        [[P5_ROLE], [P6_ROLE], []],
      ]);
    });
  });

  describe("when the bot may not change a member's roles", () => {
    it('reports it, counts it as an error and carries on', async ({ flow }) => {
      flow.discord.addRole(GUILD, { id: P5_ROLE, name: 'P5', aboveBot: true });

      const replies = await syncProgRoles(flow);

      // one member couldn't lose the P5 role, the other couldn't gain it
      for (const _ of [PROMOTED, NEWCOMER]) {
        flow.expectReported(
          /^Sentry exception: DiscordAPIError\[50013\]: Missing Permissions/,
        );
        flow.expectReported(
          /^error: \{\n\s+err: DiscordAPIError\[50013\]: Missing Permissions/,
        );
      }
      expect([replies, rolesOfMembers(flow)]).toEqual([
        privateEmbed({
          title: '✅ Sync Prog Roles',
          color: 0x2ecc71,
          fields: [
            field(
              'Summary',
              counts({ changed: 0, added: 0, removed: 0, errors: 2 }),
            ),
          ],
        }),
        [[P5_ROLE], [P6_ROLE], []],
      ]);
    });
  });

  describe('when no prog point roles are configured', () => {
    it('says to configure them first', async ({ flow }) => {
      flow.db.seed(SETTINGS_PATH, { progPointRoles: { DMU: {} } });

      expect(await syncProgRoles(flow)).toEqual([
        textReply(
          ADMIN.id,
          'No prog point role mappings configured. Use `/settings prog-point-roles` first.',
          { ephemeral: true },
        ),
      ]);
    });
  });

  describe('when Firestore cannot be reached', () => {
    it('replies with a command error, privately', async ({ flow }) => {
      flow.db.goOffline();

      const replies = await syncProgRoles(flow);

      expectCommandErrorReported(flow, '14 UNAVAILABLE');
      expect(replies).toEqual([commandErrorReply(flow, ADMIN.id)]);
    });
  });
});
