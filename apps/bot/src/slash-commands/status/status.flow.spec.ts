import {
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import { type APIEmbedField, Colors } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect } from 'vitest';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import { isoDateSince } from '../../test-utils/matchers.js';

const GUILD = 'guild-1';
const PLAYER = Object.freeze({ id: 'player-1', username: 'player' });

const NO_PARTY_TYPE = Object.freeze({
  name: '​',
  value: '​',
  inline: true,
});

/**
 * A stored signup of the player's, as the signup flow writes it: posted for
 * review, then approved by a reviewer at a prog point, which always comes with
 * its party status.
 */
function aSignup(changes: Partial<SignupDocument>): SignupDocument {
  return {
    character: 'test character',
    discordId: PLAYER.id,
    encounter: Encounter.DSR,
    notes: null,
    proofOfProgLink: 'https://www.fflogs.com/reports/abc123',
    progPointRequested: 'P6 Wroth Flames',
    role: 'tank',
    screenshot: null,
    username: PLAYER.username,
    world: 'jenova',
    expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    reviewMessageId: 'review-message-1',
    status: SignupStatus.APPROVED,
    progPoint: 'P6 Wroth Flames',
    partyStatus: PartyStatus.ProgParty,
    reviewedBy: 'reviewer',
    ...changes,
  };
}

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
  const { reply } = flow.discord.command({
    userId: PLAYER.id,
    guildId: GUILD,
    commandName: 'status',
  });
  await flow.settle();
  // the command answers through its first reply; follow-ups come after it
  reply();
  return flow.discord.repliesTo(PLAYER.id).map(shown);
}

/** The private summary /status replies with, and nothing else. */
const summary = (embed: { fields?: APIEmbedField[]; description?: string }) => [
  {
    location: { kind: 'reply', userId: PLAYER.id, ephemeral: true },
    reactions: {},
    deleted: false,
    content: undefined,
    embeds: [{ title: 'Signup Summary', ...embed }],
    components: [],
  },
];

const dsr = (status: string) => [
  { name: 'Encounter', value: '[DSR] Dragonsong Reprise', inline: true },
  { name: 'Status', value: status, inline: true },
];

describe('/status', () => {
  it('shows the label of the approved prog point, not the requested one, even once the prog point is inactive', async ({
    flow,
  }) => {
    flow.db.seed(
      'signups/player-1-DSR',
      aSignup({ progPoint: 'P7 Dragon King' }),
    );

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

  it('omits the prog point field when the signup has no approved prog point', async ({
    flow,
  }) => {
    flow.db.seed(
      'signups/player-1-DSR',
      // a new signup: posted for review, not reviewed yet
      aSignup({
        status: SignupStatus.PENDING,
        progPoint: undefined,
        partyStatus: undefined,
        reviewedBy: undefined,
      }),
    );

    await expect(status(flow)).resolves.toEqual(
      summary({ fields: [...dsr(':question: PENDING'), NO_PARTY_TYPE] }),
    );
  });

  it('omits the field and warns Sentry when the prog point id is unknown', async ({
    flow,
  }) => {
    flow.db.seed(
      'signups/player-1-DSR',
      aSignup({ progPoint: 'deleted-prog-point' }),
    );

    await expect(status(flow)).resolves.toEqual(
      summary({ fields: [...dsr('✅ APPROVED'), PROG_PARTY_TYPE] }),
    );
    flow.expectReported(
      /^Sentry warning: Approved prog point "deleted-prog-point" not found for encounter DSR$/,
    );
  });

  it('resolves each signup against its own encounter', async ({ flow }) => {
    flow.db.seed(
      'signups/player-1-DSR',
      aSignup({ progPoint: 'P6 Wroth Flames' }),
    );
    flow.db.seed(
      'signups/player-1-TOP',
      aSignup({ encounter: Encounter.TOP, progPoint: 'P5 Delta' }),
    );

    await expect(status(flow)).resolves.toEqual(
      summary({
        fields: [
          ...dsr('✅ APPROVED'),
          PROG_PARTY_TYPE,
          { name: 'Prog Point', value: 'Phase 6: Wroth Flames', inline: false },
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

  it("ignores other players' signups, saying the player has none", async ({
    flow,
  }) => {
    flow.db.seed(
      'signups/someone-else-DSR',
      aSignup({ discordId: 'someone-else' }),
    );

    await expect(status(flow)).resolves.toEqual(
      summary({
        description:
          'You have no active signups. Use /signup to signup for an encounter.',
      }),
    );
  });

  it('replies with a command error, privately, when Firestore cannot be reached', async ({
    flow,
  }) => {
    flow.db.goOffline();

    const replies = await status(flow);

    flow.expectReported(/^Sentry exception: Error: 14 UNAVAILABLE/);
    flow.expectReported(/^error: \{\n\s+err: Error: 14 UNAVAILABLE/);
    flow.expectReported(/^error: .*Command error: 14 UNAVAILABLE/);
    expect(replies).toEqual([
      {
        location: { kind: 'reply', userId: PLAYER.id, ephemeral: true },
        reactions: {},
        deleted: false,
        content: undefined,
        embeds: [
          {
            title: 'Command Error',
            description:
              'An unexpected error occurred. Please try again later.',
            color: Colors.Red,
            timestamp: isoDateSince(flow.startedAt),
          },
        ],
        components: [],
      },
    ]);
  });
});
