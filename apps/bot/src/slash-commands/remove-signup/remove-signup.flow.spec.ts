import {
  type ApprovedSignupDocument,
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import { Colors } from 'discord.js';
import { titleCase } from 'title-case';
import { test as base, describe, expect } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import {
  commandErrorReply,
  expectCommandErrorReported,
  privateReply,
} from '../../test-utils/replies.js';
import {
  nextFreeRow,
  PROG_PARTY,
  rowCleared,
} from '../../test-utils/sheets/dmu-sheet.js';
import { stableTestKey } from '../../test-utils/sheets/recorded-sheets.js';
import {
  type ApprovedSeed,
  type SeedOverrides,
  seedSignup,
} from '../../test-utils/signups.js';
import { SIGNUP_MESSAGES } from '../signup/signup.consts.js';
import {
  REMOVAL_MISSING_PERMISSIONS,
  REMOVAL_NO_DB_ENTRY,
  REMOVAL_NO_SHEET_ENTRY,
  REMOVAL_SUCCESS,
} from './remove-signup.consts.js';

const GUILD = 'guild-1';
const REVIEW_CHANNEL = 'review-channel';
const REVIEWER_ROLE = 'reviewer-role';
const PROG_ROLE = 'dmu-prog-role';
const CLEAR_ROLE = 'dmu-clear-role';
const P6_ROLE = 'dmu-p6-role';
const OTHER_ROLE = 'other-role';

const PLAYER = Object.freeze({
  id: 'player-1',
  username: 'player',
  roles: Object.freeze([PROG_ROLE, P6_ROLE, OTHER_ROLE]),
});
const REVIEWER = Object.freeze({
  id: 'reviewer-1',
  username: 'reviewer',
  roles: Object.freeze([REVIEWER_ROLE]),
});
const SOMEONE_ELSE = Object.freeze({ id: 'someone-1', username: 'someone' });

const WORLD = 'Jenova';
/** Per test, so rows a test writes to the shared spreadsheet are its own. */
const character = () => `flow ${stableTestKey()}`;

const SETTINGS = Object.freeze({
  reviewChannel: REVIEW_CHANNEL,
  reviewerRole: REVIEWER_ROLE,
  progRoles: { DMU: PROG_ROLE },
  clearRoles: { DMU: CLEAR_ROLE },
  progPointRoles: { DMU: { P6: P6_ROLE } },
});

function givenAGuild(flow: FlowApp): void {
  flow.discord.addChannel(GUILD, REVIEW_CHANNEL);
  for (const id of [
    REVIEWER_ROLE,
    PROG_ROLE,
    CLEAR_ROLE,
    P6_ROLE,
    OTHER_ROLE,
  ]) {
    flow.discord.addRole(GUILD, { id, name: id });
  }
  flow.discord.addMember(PLAYER);
  flow.discord.addMember(REVIEWER);
  flow.discord.addMember(SOMEONE_ELSE);
  flow.db.seed(`settings/${GUILD}`, SETTINGS);
  const progPoint = (id: string, partyStatus: PartyStatus, order: number) =>
    flow.db.seed(`encounters/${Encounter.DMU}/prog-points/${id}`, {
      id,
      label: `${id} label`,
      partyStatus,
      order,
      active: true,
    });
  progPoint('P6', PartyStatus.ProgParty, 0);
  progPoint('P7', PartyStatus.ClearParty, 1);
}

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      const flow = await createFlowApp();
      givenAGuild(flow);
      return flow;
    },
    async (flow) => {
      try {
        // remove whatever this test left on the shared spreadsheet
        if (flow.sheets.writes().length > 0) {
          await flow.get(SheetsService).removeSignup(
            {
              encounter: Encounter.DMU,
              character: character(),
              world: WORLD.toLowerCase(),
            },
            flow.sheets.spreadsheetId,
          );
        }
      } finally {
        await flow.close();
      }
    },
  ),
});

const signupPath = () =>
  `signups/${SignupCollection.getKeyForSignup({
    discordId: PLAYER.id,
    encounter: Encounter.DMU,
  })}`;

/** The review the bot posted for the player's signup, as it posts one. */
async function postReview(flow: FlowApp): Promise<string> {
  const channel = await flow.get(DiscordService).getTextChannel({
    guildId: GUILD,
    channelId: REVIEW_CHANNEL,
  });
  const review = await channel?.send('Signup Approval');
  if (!review) throw new Error('the review channel is not a text channel');
  return review.id;
}

/** Stores the player's DMU signup, reviewed by `review`. */
function givenASignup(
  flow: FlowApp,
  reviewMessageId: string,
  changes: ApprovedSeed,
): ApprovedSignupDocument;
function givenASignup(
  flow: FlowApp,
  reviewMessageId: string,
  changes?: SeedOverrides,
): SignupDocument;
function givenASignup(
  flow: FlowApp,
  reviewMessageId: string,
  changes: SeedOverrides = {},
): SignupDocument {
  return seedSignup(flow, {
    discordId: PLAYER.id,
    username: PLAYER.username,
    character: character(),
    world: WORLD.toLowerCase(),
    encounter: Encounter.DMU,
    reviewMessageId,
    ...changes,
  });
}

const APPROVED = Object.freeze({
  status: SignupStatus.APPROVED,
  progPoint: 'P6',
  partyStatus: PartyStatus.ProgParty,
});

/** `userId` runs /remove-signup for the player's DMU character; returns what they were shown. */
async function removeSignup(
  flow: FlowApp,
  userId: string,
  { world = WORLD }: { world?: string } = {},
) {
  flow.discord.command({
    userId,
    guildId: GUILD,
    commandName: 'remove-signup',
    options: { character: character(), world, encounter: Encounter.DMU },
  });
  await flow.settle();
  return flow.discord.repliesTo(userId).map(shown);
}

/** The private answer to `userId`: the signup they named, and `description`. */
const removalReply = (
  userId: string,
  description: string,
  {
    color = Colors.Green,
    world = WORLD,
  }: { color?: number; world?: string } = {},
) => [
  privateReply(userId, {
    embeds: [
      {
        title: 'Remove Signup',
        color,
        description,
        fields: [
          {
            name: 'Encounter',
            value: 'Dancing Mad (Ultimate)',
            inline: true,
          },
          { name: 'Character', value: titleCase(character()), inline: true },
          { name: 'World', value: world, inline: true },
        ],
      },
    ],
  }),
];

const reviewsShown = (flow: FlowApp) =>
  flow.discord.channel(REVIEW_CHANNEL).map(shown);

/** The review postReview() posts, as it's still shown when kept. */
const KEPT_REVIEW = Object.freeze({
  location: { kind: 'channel', guildId: GUILD, channelId: REVIEW_CHANNEL },
  reactions: {},
  deleted: false,
  content: 'Signup Approval',
  embeds: [],
  components: [],
});

describe('Remove signup', () => {
  describe('when a player removes their pending signup', () => {
    it.beforeEach(async ({ flow }) => {
      givenASignup(flow, await postReview(flow));
      await removeSignup(flow, PLAYER.id);
    });

    it('deletes it', ({ flow }) => {
      expect(flow.db.read(signupPath())).toBeUndefined();
    });

    it('deletes its review, which nobody needs to act on anymore', ({
      flow,
    }) => {
      expect(reviewsShown(flow)).toEqual([]);
    });

    it('tells them, privately, it worked', ({ flow }) => {
      expect(flow.discord.repliesTo(PLAYER.id).map(shown)).toEqual(
        removalReply(PLAYER.id, REMOVAL_SUCCESS),
      );
    });
  });

  describe('when a player removes their approved signup', () => {
    it.beforeEach(async ({ flow }) => {
      givenASignup(flow, await postReview(flow), APPROVED);
      await removeSignup(flow, PLAYER.id);
    });

    it('deletes it, but keeps its review as a record of the decision', ({
      flow,
    }) => {
      expect([flow.db.read(signupPath()), reviewsShown(flow)]).toEqual([
        undefined,
        [KEPT_REVIEW],
      ]);
    });

    it("takes away the encounter's roles and no others", ({ flow }) => {
      expect(flow.discord.rolesOf(PLAYER.id)).toEqual([OTHER_ROLE]);
    });
  });

  describe('when the encounter has no prog point roles', () => {
    it('takes away its prog and clear roles only', async ({ flow }) => {
      const { progPointRoles: _, ...withoutProgPointRoles } = SETTINGS;
      flow.db.seed(`settings/${GUILD}`, withoutProgPointRoles);
      givenASignup(flow, await postReview(flow), APPROVED);

      await removeSignup(flow, PLAYER.id);

      expect(flow.discord.rolesOf(PLAYER.id)).toEqual([P6_ROLE, OTHER_ROLE]);
    });
  });

  describe('when a reviewer removes the signup of a player who left the server', () => {
    it('removes it', async ({ flow }) => {
      givenASignup(flow, await postReview(flow), {
        ...APPROVED,
        discordId: 'left-1',
      });
      const leftPath = `signups/${SignupCollection.getKeyForSignup({
        discordId: 'left-1',
        encounter: Encounter.DMU,
      })}`;

      const replies = await removeSignup(flow, REVIEWER.id);

      expect([flow.db.read(leftPath), replies]).toEqual([
        undefined,
        removalReply(REVIEWER.id, REMOVAL_SUCCESS),
      ]);
    });
  });

  describe('when no review channel is configured any more', () => {
    it('removes the pending signup, leaving its review alone', async ({
      flow,
    }) => {
      const { reviewChannel: _, ...withoutReviewChannel } = SETTINGS;
      flow.db.seed(`settings/${GUILD}`, withoutReviewChannel);
      givenASignup(flow, await postReview(flow));

      const replies = await removeSignup(flow, PLAYER.id);

      expect([flow.db.read(signupPath()), reviewsShown(flow), replies]).toEqual(
        [undefined, [KEPT_REVIEW], removalReply(PLAYER.id, REMOVAL_SUCCESS)],
      );
    });
  });

  describe('when the approved signup is on the spreadsheet', () => {
    it('clears its row', async ({ flow }) => {
      const { spreadsheetId } = flow.sheets;
      flow.db.seed(`settings/${GUILD}`, { ...SETTINGS, spreadsheetId });
      const signup = givenASignup(flow, await postReview(flow), APPROVED);
      // the row the bot wrote when the signup was approved
      await flow.get(SheetsService).upsertSignup(signup, spreadsheetId);
      const row = nextFreeRow(flow, PROG_PARTY);
      const written = flow.sheets.writes().length;

      const replies = await removeSignup(flow, PLAYER.id);

      expect([flow.sheets.writes().slice(written), replies]).toEqual([
        [rowCleared(flow, PROG_PARTY, row)],
        removalReply(PLAYER.id, REMOVAL_SUCCESS),
      ]);
    });
  });

  describe('when a player removes an approved signup they resubmitted', () => {
    it('clears its row and deletes the pending update review', async ({
      flow,
    }) => {
      const { spreadsheetId } = flow.sheets;
      flow.db.seed(`settings/${GUILD}`, { ...SETTINGS, spreadsheetId });
      const reviewMessageId = await postReview(flow);
      // the row the bot wrote when the signup was first approved
      await flow
        .get(SheetsService)
        .upsertSignup(
          givenASignup(flow, reviewMessageId, APPROVED),
          spreadsheetId,
        );
      // and then the player resubmitted it
      givenASignup(flow, reviewMessageId, {
        ...APPROVED,
        status: SignupStatus.UPDATE_PENDING,
      });
      const row = nextFreeRow(flow, PROG_PARTY);
      const written = flow.sheets.writes().length;

      const replies = await removeSignup(flow, PLAYER.id);

      expect([
        flow.sheets.writes().slice(written),
        reviewsShown(flow),
        replies,
      ]).toEqual([
        [rowCleared(flow, PROG_PARTY, row)],
        [],
        removalReply(PLAYER.id, REMOVAL_SUCCESS),
      ]);
    });
  });

  describe('when the approved signup is not on the spreadsheet', () => {
    it('removes it and says the sheet had no entry', async ({ flow }) => {
      flow.db.seed(`settings/${GUILD}`, {
        ...SETTINGS,
        spreadsheetId: flow.sheets.spreadsheetId,
      });
      givenASignup(flow, await postReview(flow), APPROVED);

      const replies = await removeSignup(flow, PLAYER.id);

      expect([
        flow.db.read(signupPath()),
        flow.sheets.writes(),
        replies,
      ]).toEqual([
        undefined,
        [],
        removalReply(PLAYER.id, REMOVAL_NO_SHEET_ENTRY),
      ]);
    });
  });

  describe("when a reviewer removes a player's signup", () => {
    it('deletes it', async ({ flow }) => {
      givenASignup(flow, await postReview(flow));

      const replies = await removeSignup(flow, REVIEWER.id);

      expect([flow.db.read(signupPath()), replies]).toEqual([
        undefined,
        removalReply(REVIEWER.id, REMOVAL_SUCCESS),
      ]);
    });
  });

  describe("when someone else tries to remove a player's signup", () => {
    it('refuses and keeps it', async ({ flow }) => {
      const signup = givenASignup(flow, await postReview(flow));

      const replies = await removeSignup(flow, SOMEONE_ELSE.id);

      expect([flow.db.read(signupPath()), replies]).toEqual([
        signup,
        removalReply(SOMEONE_ELSE.id, REMOVAL_MISSING_PERMISSIONS, {
          color: Colors.Red,
        }),
      ]);
    });
  });

  describe('when there is no such signup', () => {
    it('says none was found', async ({ flow }) => {
      expect(await removeSignup(flow, PLAYER.id)).toEqual(
        removalReply(PLAYER.id, REMOVAL_NO_DB_ENTRY, { color: Colors.Red }),
      );
    });
  });

  describe('when the world is not a North American world', () => {
    it('explains, privately, what to correct', async ({ flow }) => {
      expect(await removeSignup(flow, PLAYER.id, { world: 'Moogle' })).toEqual([
        privateReply(PLAYER.id, {
          embeds: [
            {
              title: 'Remove Signup - Validation Error',
              description:
                '**World**: Invalid World. Please check the spelling and make sure it is a valid world in the NA Region',
              color: Colors.Red,
            },
          ],
        }),
      ]);
    });
  });

  describe('when the guild has no settings', () => {
    it('refuses and asks the player to contact an administrator', async ({
      flow,
    }) => {
      const signup = givenASignup(flow, await postReview(flow));
      await flow.db.collection('settings').doc(GUILD).delete();

      const replies = await removeSignup(flow, PLAYER.id);

      expect([flow.db.read(signupPath()), replies]).toEqual([
        signup,
        removalReply(PLAYER.id, SIGNUP_MESSAGES.MISSING_SETTINGS, {
          color: Colors.Red,
        }),
      ]);
    });
  });

  describe('when its review was already deleted', () => {
    it('reports it and still removes the signup', async ({ flow }) => {
      givenASignup(flow, 'deleted-review');

      const replies = await removeSignup(flow, PLAYER.id);

      flow.expectReported(
        /^Sentry exception: DiscordAPIError\[10008\]: Unknown Message/,
      );
      expect([flow.db.read(signupPath()), replies]).toEqual([
        undefined,
        removalReply(PLAYER.id, REMOVAL_SUCCESS),
      ]);
    });
  });

  describe("when the bot may not manage one of the player's roles", () => {
    it('reports it and still removes the signup, leaving their roles', async ({
      flow,
    }) => {
      // raised above the bot's own role since the player got it
      flow.discord.addRole(GUILD, {
        id: P6_ROLE,
        name: P6_ROLE,
        aboveBot: true,
      });
      givenASignup(flow, await postReview(flow), APPROVED);

      await removeSignup(flow, PLAYER.id);

      flow.expectReported(
        /^Sentry exception: DiscordAPIError\[50013\]: Missing Permissions/,
      );
      expect([
        flow.db.read(signupPath()),
        flow.discord.rolesOf(PLAYER.id),
      ]).toEqual([undefined, [PROG_ROLE, P6_ROLE, OTHER_ROLE]]);
    });
  });

  describe('when Firestore cannot be reached', () => {
    it('replies with a command error, privately', async ({ flow }) => {
      flow.db.goOffline();

      const replies = await removeSignup(flow, PLAYER.id);

      expectCommandErrorReported(flow, '14 UNAVAILABLE');
      expect(replies).toEqual([commandErrorReply(flow, PLAYER.id)]);
    });
  });
});
