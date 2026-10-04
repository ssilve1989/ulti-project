import { Encounter, PartyStatus } from '@ulti-project/shared';
import { Colors, PermissionFlagsBits } from 'discord.js';
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

const GUILD = 'guild-1';
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
      flow.discord.addMember(ADMIN);
      return flow;
    },
    (flow) => flow.close(),
  ),
});

/** Stores DSR as the encounter migration writes it, with prog points in no particular order. */
function seedDsr(
  flow: FlowApp,
  thresholds: { progPartyThreshold?: string; clearPartyThreshold?: string },
): void {
  flow.db.seed(`encounters/${Encounter.DSR}`, {
    name: 'Dragonsong Reprise',
    description: 'DSR',
    active: true,
    ...thresholds,
  });
  const progPoint = (
    id: string,
    label: string,
    partyStatus: PartyStatus,
    order: number,
    active = true,
  ) =>
    flow.db.seed(`encounters/${Encounter.DSR}/prog-points/${id}`, {
      id,
      label,
      partyStatus,
      order,
      active,
    });
  progPoint('P6', 'Phase 6: Wroth Flames', PartyStatus.ClearParty, 3);
  progPoint('P2', 'Phase 2: Thordan', PartyStatus.EarlyProgParty, 0);
  progPoint('P3', 'Phase 3: Nidhogg', PartyStatus.ProgParty, 1);
  progPoint('P4', 'Phase 4: Eyes', PartyStatus.ProgParty, 2, false);
  progPoint('C', 'Cleared', PartyStatus.Cleared, 4);
}

/** The admin runs `/encounters view` and the bot answers. */
async function viewEncounters(flow: FlowApp, encounter?: Encounter) {
  flow.discord.command({
    userId: ADMIN.id,
    guildId: GUILD,
    commandName: 'encounters',
    subcommand: 'view',
    options: encounter ? { encounter } : {},
  });
  await flow.settle();
  return flow.discord.repliesTo(ADMIN.id).map(shown);
}

const privateEmbed = (embed: object) => [
  privateReply(ADMIN.id, { embeds: [{ color: Colors.Blue, ...embed }] }),
];

describe('Encounters', () => {
  describe('when an admin views a configured encounter', () => {
    /** DSR as seeded, with `thresholds` as its threshold fields show them. */
    const dsrConfiguration = (thresholds: { prog: string; clear: string }) =>
      privateEmbed({
        title: 'Dragonsong Reprise Configuration',
        description: 'Total prog points: 5',
        fields: [
          { name: '📈 Prog Party Threshold', value: thresholds.prog },
          { name: '🎯 Clear Party Threshold', value: thresholds.clear },
          {
            name: '🟡 Early Prog Party (1)',
            value: '• ✅ Phase 2: Thordan (P2)',
            inline: false,
          },
          {
            name: '🟠 Prog Party (2)',
            value: '• ✅ Phase 3: Nidhogg (P3)\n• ❌ Phase 4: Eyes (P4)',
            inline: false,
          },
          {
            name: '🔴 Clear Party (1)',
            value: '• ✅ Phase 6: Wroth Flames (P6)',
            inline: false,
          },
          {
            name: '✅ Cleared (1)',
            value: '• ✅ Cleared (C)',
            inline: false,
          },
        ],
      });

    it('shows its thresholds and its prog points by party, in order', async ({
      flow,
    }) => {
      seedDsr(flow, { progPartyThreshold: 'P3', clearPartyThreshold: 'P6' });

      expect(await viewEncounters(flow, Encounter.DSR)).toEqual(
        dsrConfiguration({
          prog: 'Phase 3: Nidhogg (P3)',
          clear: 'Phase 6: Wroth Flames (P6)',
        }),
      );
    });

    it('says which thresholds are not set', async ({ flow }) => {
      seedDsr(flow, {});

      expect(await viewEncounters(flow, Encounter.DSR)).toEqual(
        dsrConfiguration({ prog: 'Not set', clear: 'Not set' }),
      );
    });
  });

  describe('when an encounter has no prog points for some parties', () => {
    it('lists only the parties it has prog points for', async ({ flow }) => {
      flow.db.seed(`encounters/${Encounter.TOP}`, {
        name: 'The Omega Protocol',
        description: 'TOP',
        active: true,
      });
      flow.db.seed(`encounters/${Encounter.TOP}/prog-points/P5`, {
        id: 'P5',
        label: 'Phase 5: Delta',
        partyStatus: PartyStatus.ProgParty,
        order: 0,
        active: true,
      });

      expect(await viewEncounters(flow, Encounter.TOP)).toEqual(
        privateEmbed({
          title: 'The Omega Protocol Configuration',
          description: 'Total prog points: 1',
          fields: [
            { name: '📈 Prog Party Threshold', value: 'Not set' },
            { name: '🎯 Clear Party Threshold', value: 'Not set' },
            {
              name: '🟠 Prog Party (1)',
              value: '• ✅ Phase 5: Delta (P5)',
              inline: false,
            },
          ],
        }),
      );
    });
  });

  describe('when an admin views an encounter that has not been set up', () => {
    it('says it was not found', async ({ flow }) => {
      expect(await viewEncounters(flow, Encounter.TOP)).toEqual([
        textReply(ADMIN.id, '❌ Encounter TOP not found.', { ephemeral: true }),
      ]);
    });
  });

  describe('when viewing an encounter fails', () => {
    it('replies with a command error, privately, and reports it', async ({
      flow,
    }) => {
      flow.db.goOffline();

      const replies = await viewEncounters(flow, Encounter.DSR);

      expectCommandErrorReported(flow, '14 UNAVAILABLE');
      expect(replies).toEqual([commandErrorReply(flow, ADMIN.id)]);
    });
  });

  describe('when an admin views every encounter', () => {
    it('lists the configured ones with their prog point counts', async ({
      flow,
    }) => {
      seedDsr(flow, {});
      flow.db.seed(`encounters/${Encounter.TOP}`, {
        name: 'The Omega Protocol',
        description: 'TOP',
        active: true,
      });

      expect(await viewEncounters(flow)).toEqual(
        privateEmbed({
          title: 'All Encounters Overview',
          description: 'Configuration status for all encounters:',
          fields: [
            {
              name: '✅ Configured TOP',
              value: 'The Omega Protocol\nProg Points: 0',
              inline: true,
            },
            {
              name: '✅ Configured DSR',
              value: 'Dragonsong Reprise\nProg Points: 5',
              inline: true,
            },
          ],
        }),
      );
    });

    it('says to run the migration when none is set up', async ({ flow }) => {
      expect(await viewEncounters(flow)).toEqual(
        privateEmbed({
          title: 'All Encounters Overview',
          description:
            'No encounter data found. Run the migration script to populate data from constants.',
        }),
      );
    });

    it('still shows an encounter that has prog points but no document', async ({
      flow,
    }) => {
      flow.db.seed(`encounters/${Encounter.TOP}/prog-points/P5`, {
        id: 'P5',
        label: 'Phase 5: Delta',
        partyStatus: PartyStatus.ProgParty,
        order: 0,
        active: true,
      });

      expect(await viewEncounters(flow)).toEqual(
        privateEmbed({
          title: 'All Encounters Overview',
          description: 'Configuration status for all encounters:',
          fields: [
            {
              name: '⚠️ Partial data TOP',
              value: '[TOP] The Omega Protocol\nProg Points: 1',
              inline: true,
            },
          ],
        }),
      );
    });

    it('flags every encounter and says to run the migration when loading fails', async ({
      flow,
    }) => {
      flow.db.goOffline();

      const replies = await viewEncounters(flow);

      for (const encounter of Object.keys(Encounter)) {
        flow.expectReported(
          new RegExp(`Failed to load data for encounter ${encounter}`),
        );
      }
      expect(replies).toEqual(
        privateEmbed({
          title: 'All Encounters Overview',
          description:
            'No encounter data found. Run the migration script to populate data from constants.',
          fields: Object.keys(Encounter).map((key) => ({
            name: `❌ ${key}`,
            value: 'Error loading data',
            inline: true,
          })),
        }),
      );
    });
  });
});
