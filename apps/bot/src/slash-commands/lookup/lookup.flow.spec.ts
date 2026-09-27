import {
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import { Colors, PermissionFlagsBits } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect } from 'vitest';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import {
  commandErrorReply,
  expectCommandErrorReported,
  replyTo,
} from '../../test-utils/replies.js';

const GUILD = 'guild-1';
const ADMIN = Object.freeze({
  id: 'admin-1',
  username: 'admin',
  permissions: PermissionFlagsBits.Administrator,
});
const CHARACTER = 'flow tester';

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

/** Stores a signup as the signup flow writes one, reviewed or not. */
function seedSignup(flow: FlowApp, signup: Partial<SignupDocument>): void {
  const stored: SignupDocument = {
    character: CHARACTER,
    discordId: 'player-1',
    encounter: Encounter.DSR,
    notes: null,
    proofOfProgLink: 'https://www.fflogs.com/reports/abc123',
    progPointRequested: 'P6 Wroth Flames',
    role: 'tank',
    screenshot: null,
    username: 'player',
    world: 'jenova',
    expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    reviewMessageId: 'review-message-1',
    status: SignupStatus.PENDING,
    ...signup,
  };
  flow.db.seed(`signups/${SignupCollection.getKeyForSignup(stored)}`, stored);
}

/** The admin runs /lookup and the bot answers. */
async function lookup(flow: FlowApp, options: Record<string, string>) {
  flow.discord.command({
    userId: ADMIN.id,
    guildId: GUILD,
    commandName: 'lookup',
    options,
  });
  await flow.settle();
  return flow.discord.repliesTo(ADMIN.id).map(shown);
}

const privateEmbeds = (embeds: unknown[]) => [
  {
    location: replyTo(ADMIN.id, { ephemeral: true }),
    reactions: {},
    deleted: false,
    content: undefined,
    embeds,
    components: [],
  },
];

const field = (name: string, value: string, inline = true) => ({
  name,
  value,
  inline,
});

/** A signup's lines in a lookup result. */
const signupFields = ({
  encounter,
  progPoint,
  blacklisted,
  notes,
}: {
  encounter: string;
  progPoint?: string;
  blacklisted: 'Yes' | 'No';
  notes?: string;
}) => [
  field('Encounter', encounter),
  ...(progPoint ? [field('Prog Point', progPoint)] : []),
  field('\u200b', '\u200b'),
  field('Blacklisted', blacklisted),
  ...(notes ? [field('Notes', notes, false)] : []),
];

describe('Lookup', () => {
  describe('when an admin looks up a character on several worlds', () => {
    it.beforeEach(({ flow }) => {
      seedSignup(flow, {
        encounter: Encounter.DSR,
        status: SignupStatus.APPROVED,
        progPoint: 'P6 Wroth Flames',
        partyStatus: PartyStatus.ProgParty,
        notes: 'reclear',
      });
      seedSignup(flow, { encounter: Encounter.TOP });
      seedSignup(flow, {
        discordId: 'player-2',
        world: 'gilgamesh',
        encounter: Encounter.DSR,
      });
      flow.db.seed(`blacklist/${GUILD}/documents/player-2`, {
        discordId: 'player-2',
        characterName: null,
        reason: 'Harassment',
        lodestoneId: null,
      });
    });

    it("shows each world's signups, and whether the player is blacklisted", async ({
      flow,
    }) => {
      expect(await lookup(flow, { character: 'Flow Tester' })).toEqual(
        privateEmbeds([
          {
            title: 'Lookup Results for Flow Tester @ Jenova',
            color: Colors.Green,
            fields: [
              ...signupFields({
                encounter: '[DSR] Dragonsong Reprise',
                progPoint: 'P6 Wroth Flames',
                blacklisted: 'No',
                notes: 'reclear',
              }),
              ...signupFields({
                encounter: '[TOP] The Omega Protocol',
                blacklisted: 'No',
              }),
            ],
          },
          {
            title: 'Lookup Results for Flow Tester @ Gilgamesh',
            color: Colors.Green,
            fields: signupFields({
              encounter: '[DSR] Dragonsong Reprise',
              blacklisted: 'Yes',
            }),
          },
        ]),
      );
    });

    it('shows only the given world', async ({ flow }) => {
      expect(
        await lookup(flow, { character: 'Flow Tester', world: 'Gilgamesh' }),
      ).toEqual(
        privateEmbeds([
          {
            title: 'Lookup Results for Flow Tester @ Gilgamesh',
            color: Colors.Green,
            fields: signupFields({
              encounter: '[DSR] Dragonsong Reprise',
              blacklisted: 'Yes',
            }),
          },
        ]),
      );
    });
  });

  describe('when nobody by that name signed up', () => {
    it('says no results were found', async ({ flow }) => {
      seedSignup(flow, { character: 'someone else' });

      expect(await lookup(flow, { character: 'Flow Tester' })).toEqual(
        privateEmbeds([
          {
            title: 'Lookup Results',
            description: 'No results found!',
            color: Colors.Red,
          },
        ]),
      );
    });
  });

  describe('when the world is not a North American world', () => {
    it('explains, privately, what to correct', async ({ flow }) => {
      expect(
        await lookup(flow, { character: 'Flow Tester', world: 'Moogle' }),
      ).toEqual(
        privateEmbeds([
          {
            title: 'Validation Error',
            description:
              '**World**: Invalid World. Please check the spelling and make sure it is a valid world in the NA Region',
            color: Colors.Red,
          },
        ]),
      );
    });
  });

  describe('when Firestore cannot be reached', () => {
    it('replies with a command error, privately', async ({ flow }) => {
      flow.db.goOffline();

      const replies = await lookup(flow, { character: 'Flow Tester' });

      expectCommandErrorReported(flow, '14 UNAVAILABLE');
      expect(replies).toEqual([commandErrorReply(flow, ADMIN.id)]);
    });
  });
});
