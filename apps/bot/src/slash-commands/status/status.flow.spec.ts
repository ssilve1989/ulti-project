import {
  type ApprovedSignupDocument,
  Encounter,
  PartyStatus,
  SignupStatus,
} from '@ulti-project/shared';
import { type APIEmbedField } from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { shown } from '#src/test-utils/discord/fake-message.js';
import { fresh } from '#src/test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '#src/test-utils/flow-app.js';
import {
  commandErrorReply,
  expectCommandErrorReported,
  privateReply,
} from '#src/test-utils/replies.js';
import { seedSignup } from '#src/test-utils/signups.js';

const GUILD = 'guild-1';
const PLAYER = Object.freeze({ id: 'player-1', username: 'player' });

const NO_PARTY_TYPE = Object.freeze({
  name: '​',
  value: '​',
  inline: true,
});

/** The player's signup, approved at `progPoint` in a prog party, as the signup flow stores it. */
const approved = (
  flow: FlowApp,
  progPoint: string,
  changes: Partial<ApprovedSignupDocument> = {},
) =>
  seedSignup(flow, {
    discordId: PLAYER.id,
    encounter: Encounter.DSR,
    status: SignupStatus.APPROVED,
    progPoint,
    partyStatus: PartyStatus.ProgParty,
    reviewedBy: 'reviewer',
    ...changes,
  });

const PROG_PARTY_TYPE = Object.freeze({
  name: 'Party Type',
  value: 'Prog Party',
  inline: true,
});

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      const flow = await createFlowApp();
      flow.discord.addChannel(GUILD, 'general');
      flow.discord.addMember(PLAYER);
      seedProgPoints(flow);
      return flow;
    },
    (flow) => flow.close(),
  ),
});

function seedProgPoints(flow: FlowApp): void {
  const progPoint = (
    encounter: Encounter,
    id: string,
    label: string,
    order: number,
    active = true,
  ) =>
    flow.db.seed(`encounters/${encounter}/prog-points/${id}`, {
      id,
      label,
      partyStatus: PartyStatus.ProgParty,
      order,
      active,
    });

  progPoint(Encounter.DSR, 'P6 Wroth Flames', 'Phase 6: Wroth Flames', 0);
  // inactive: a signup approved at it before it was retired still shows it
  progPoint(
    Encounter.DSR,
    'P7 Dragon King',
    'Phase 7: Dragon King Thordan',
    1,
    false,
  );
  progPoint(Encounter.TOP, 'P5 Delta', 'Phase 5: Delta', 0);
}

/** Runs /status as the player and returns every reply they got. */
async function status(flow: FlowApp) {
  flow.discord.command({
    userId: PLAYER.id,
    guildId: GUILD,
    commandName: 'status',
  });
  await flow.settle();
  return flow.discord.repliesTo(PLAYER.id).map(shown);
}

/** The private summary /status replies with, and nothing else. */
const summary = (embed: { fields?: APIEmbedField[]; description?: string }) => [
  privateReply(PLAYER.id, { embeds: [{ title: 'Signup Summary', ...embed }] }),
];

const dsr = (status: string) => [
  { name: 'Encounter', value: '[DSR] Dragonsong Reprise', inline: true },
  { name: 'Status', value: status, inline: true },
];

describe('Status', () => {
  describe('when a player checks an approved signup', () => {
    it('shows the label of the approved prog point, even once it is inactive', async ({
      flow,
    }) => {
      approved(flow, 'P7 Dragon King');

      await expect(status(flow)).resolves.toEqual(
        summary({
          fields: [
            ...dsr('✅ APPROVED'),
            PROG_PARTY_TYPE,
            {
              name: 'Prog Point',
              value: 'Phase 7: Dragon King Thordan',
              inline: false,
            },
          ],
        }),
      );
    });
  });

  describe('when the signup has not been reviewed yet', () => {
    it('shows no prog point or party', async ({ flow }) => {
      seedSignup(flow, { discordId: PLAYER.id, encounter: Encounter.DSR });

      await expect(status(flow)).resolves.toEqual(
        summary({ fields: [...dsr(':question: PENDING'), NO_PARTY_TYPE] }),
      );
    });
  });

  describe('when the approved prog point no longer exists', () => {
    it('shows no prog point and warns Sentry', async ({ flow }) => {
      approved(flow, 'deleted-prog-point');

      await expect(status(flow)).resolves.toEqual(
        summary({ fields: [...dsr('✅ APPROVED'), PROG_PARTY_TYPE] }),
      );
      flow.expectReported(
        /^Sentry warning: Approved prog point "deleted-prog-point" not found for encounter DSR$/,
      );
    });
  });

  describe('when the player has signups for several encounters', () => {
    it("shows each with its own encounter's prog point", async ({ flow }) => {
      approved(flow, 'P6 Wroth Flames');
      approved(flow, 'P5 Delta', { encounter: Encounter.TOP });

      await expect(status(flow)).resolves.toEqual(
        summary({
          fields: [
            ...dsr('✅ APPROVED'),
            PROG_PARTY_TYPE,
            {
              name: 'Prog Point',
              value: 'Phase 6: Wroth Flames',
              inline: false,
            },
            {
              name: 'Encounter',
              value: '[TOP] The Omega Protocol',
              inline: true,
            },
            { name: 'Status', value: '✅ APPROVED', inline: true },
            PROG_PARTY_TYPE,
            { name: 'Prog Point', value: 'Phase 5: Delta', inline: false },
          ],
        }),
      );
    });
  });

  describe('when only other players have signed up', () => {
    it('says the player has no signups', async ({ flow }) => {
      approved(flow, 'P6 Wroth Flames', { discordId: 'someone-else' });

      await expect(status(flow)).resolves.toEqual(
        summary({
          description:
            'You have no active signups. Use /signup to signup for an encounter.',
        }),
      );
    });
  });

  describe('when Firestore cannot be reached', () => {
    it('replies with a command error, privately', async ({ flow }) => {
      flow.db.goOffline();

      const replies = await status(flow);

      expectCommandErrorReported(flow, '14 UNAVAILABLE');
      expect(replies).toEqual([commandErrorReply(flow, PLAYER.id)]);
    });
  });
});
