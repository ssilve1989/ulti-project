import { Encounter, PartyStatus, SignupStatus } from '@ulti-project/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { FakeMessage } from '../../test-utils/discord/fake-message.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import {
  APPROVAL_CANCEL_BUTTON_ID,
  APPROVAL_COMMENT_INPUT_ID,
  APPROVE_BUTTON_ID,
  APPROVE_WITH_COMMENT_BUTTON_ID,
} from './approval-decision.components.js';
import { CUSTOM_DECLINE_REASON_INPUT_ID } from './decline-reason.components.js';
import { SignupCommandHandler } from './handlers/signup.command-handler.js';
import {
  CUSTOM_DECLINE_REASON_VALUE,
  SIGNUP_DECLINE_REASONS_CONFIG,
  SIGNUP_MESSAGES,
  SIGNUP_REVIEW_REACTIONS,
} from './signup.consts.js';

const GUILD = 'guild-1';
const REVIEW_CHANNEL = 'review-channel';
const SIGNUP_CHANNEL = 'signup-channel';
const SPREADSHEET = 'spreadsheet-1';
const REVIEWER_ROLE = 'reviewer-role';
const DSR_PROG_ROLE = 'dsr-prog-role';
const DSR_CLEAR_ROLE = 'dsr-clear-role';
const DSR_P6_ROLE = 'dsr-p6-role';

const PLAYER = {
  id: 'player-1',
  username: 'player',
  displayName: 'Test Character',
};
const REVIEWER = {
  id: 'reviewer-1',
  username: 'reviewer',
  roles: [REVIEWER_ROLE],
};

const SIGNUP_PATH = `signups/${SignupCollection.getKeyForSignup({
  discordId: PLAYER.id,
  encounter: Encounter.DSR,
})}`;

const SIGNUP_OPTIONS: Record<string, string | null> = {
  encounter: Encounter.DSR,
  character: 'Test Character',
  world: 'Jenova',
  job: 'tank',
  'prog-point': 'P6',
  'prog-proof-link': 'https://www.fflogs.com/reports/abc123',
  notes: null,
};

/** A guild configured for DSR signups, with a player and a reviewer. */
function givenAGuild(flow: FlowApp): void {
  flow.db.seed(`settings/${GUILD}`, {
    reviewChannel: REVIEW_CHANNEL,
    reviewerRole: REVIEWER_ROLE,
    signupChannel: SIGNUP_CHANNEL,
    spreadsheetId: SPREADSHEET,
    progRoles: { DSR: DSR_PROG_ROLE },
    clearRoles: { DSR: DSR_CLEAR_ROLE },
    progPointRoles: { DSR: { P6: DSR_P6_ROLE } },
  });
  flow.db.seed(`encounters/${Encounter.DSR}`, {
    name: 'DSR',
    description: 'Dragonsong Reprise',
    active: true,
  });
  flow.db.seed(`encounters/${Encounter.DSR}/prog-points/P6`, {
    id: 'P6',
    label: 'P6 Enrage',
    partyStatus: PartyStatus.ProgParty,
    order: 0,
    active: true,
  });
  flow.db.seed(`encounters/${Encounter.DSR}/prog-points/P7`, {
    id: 'P7',
    label: 'P7 Dragon King',
    partyStatus: PartyStatus.ClearParty,
    order: 1,
    active: true,
  });
  flow.discord.addChannel(GUILD, REVIEW_CHANNEL);
  flow.discord.addChannel(GUILD, SIGNUP_CHANNEL);
  flow.discord.addMember(PLAYER);
  flow.discord.addMember(REVIEWER);
}

type Answer = 'confirm' | 'cancel' | 'timeout' | 'none';

/**
 * Runs /signup as the player and answers the confirmation prompt. Use 'none'
 * when the bot rejects the signup before prompting. Returns the player's reply.
 */
async function submitSignup(
  flow: FlowApp,
  answer: Answer = 'confirm',
  overrides: Record<string, string | null> = {},
): Promise<FakeMessage> {
  const { interaction, reply } = flow.discord.command({
    userId: PLAYER.id,
    guildId: GUILD,
    commandName: 'signup',
    options: { ...SIGNUP_OPTIONS, ...overrides },
  });

  const done = flow.get(SignupCommandHandler).execute(interaction);
  await flow.settle();

  if (answer === 'confirm' || answer === 'cancel') {
    flow.discord.click(reply(), answer, PLAYER.id);
  } else {
    // 'none' expires too: a prompt the test didn't expect then fails the
    // assertions immediately instead of hanging until the test times out
    flow.discord.expireAll();
  }

  await done;
  await flow.settle();
  return reply();
}

function latestReview(flow: FlowApp): FakeMessage {
  const review = flow.discord.channel(REVIEW_CHANNEL).at(-1);
  if (!review) throw new Error('No review message was posted');
  return review;
}

const OTHER_REVIEWER = {
  id: 'reviewer-2',
  username: 'reviewer2',
  roles: [REVIEWER_ROLE],
};

/** The reviewer approves the latest review at `progPoint`, optionally leaving a comment. */
async function approve(
  flow: FlowApp,
  { progPoint, comment }: { progPoint: string; comment?: string },
): Promise<void> {
  flow.discord.react(
    latestReview(flow),
    SIGNUP_REVIEW_REACTIONS.APPROVED,
    REVIEWER.id,
  );
  await flow.settle();

  const prompt = flow.discord.latestDmTo(REVIEWER.id);
  flow.discord.choose(prompt, progPoint, REVIEWER.id);
  await flow.settle();

  if (comment === undefined) {
    flow.discord.click(prompt, APPROVE_BUTTON_ID, REVIEWER.id);
  } else {
    flow.discord.click(prompt, APPROVE_WITH_COMMENT_BUTTON_ID, REVIEWER.id);
    await flow.settle();
    flow.discord.submitModal(REVIEWER.id, {
      [APPROVAL_COMMENT_INPUT_ID]: comment,
    });
  }
  await flow.settle();
}

/** The reviewer declines the latest review and picks `reason`. */
async function decline(flow: FlowApp, reason: string): Promise<void> {
  flow.discord.react(
    latestReview(flow),
    SIGNUP_REVIEW_REACTIONS.DECLINED,
    REVIEWER.id,
  );
  await flow.settle();

  flow.discord.choose(
    flow.discord.latestDmTo(REVIEWER.id),
    reason,
    REVIEWER.id,
  );
  await flow.settle();
}

describe('Signup lifecycle', () => {
  let flow: FlowApp;

  beforeEach(async () => {
    flow = await createFlowApp();
    givenAGuild(flow);
  });

  afterEach(() => flow.close());

  describe('when a player submits a signup and confirms', () => {
    let reply: FakeMessage;

    beforeEach(async () => {
      reply = await submitSignup(flow);
    });

    it('stores it as pending', () => {
      expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
        character: 'test character',
        world: 'jenova',
        progPointRequested: 'P6',
        status: SignupStatus.PENDING,
      });
    });

    it('tells the player it was received', () => {
      expect(reply.content).toBe(SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CONFIRMED);
    });

    it('acknowledges the confirm button', () => {
      expect(flow.discord.unacknowledged()).toEqual([]);
    });

    it('posts it for review with approve and decline reactions', () => {
      const review = latestReview(flow);

      expect(review.content).toContain(`<@${PLAYER.id}>`);
      expect([...review.reactions.keys()]).toEqual([
        SIGNUP_REVIEW_REACTIONS.APPROVED,
        SIGNUP_REVIEW_REACTIONS.DECLINED,
      ]);
      expect(
        review.embeds[0]?.fields?.map((field) => field.name),
      ).not.toContain('Previously Approved Prog Point');
    });

    it('links the review message to the stored signup', () => {
      expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
        reviewMessageId: latestReview(flow).id,
      });
    });
  });

  describe('when the player cancels', () => {
    it('stores nothing, posts no review and says it was cancelled', async () => {
      const reply = await submitSignup(flow, 'cancel');

      expect(reply.content).toBe(SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CANCELLED);
      expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
      expect(flow.discord.channel(REVIEW_CHANNEL)).toEqual([]);
    });
  });

  describe('when the player does not answer in time', () => {
    it('stores nothing and says the confirmation timed out', async () => {
      const reply = await submitSignup(flow, 'timeout');

      flow.expectLoggedError(/InteractionCollectorError/);
      flow.expectLoggedError(
        /Command error: Collector received no interactions/,
      );
      expect(reply.content).toBe(SIGNUP_MESSAGES.CONFIRMATION_TIMEOUT);
      expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
    });
  });

  describe('when no review channel is configured', () => {
    it('refuses the signup and asks the player to contact an administrator', async () => {
      flow.db.seed(`settings/${GUILD}`, { reviewerRole: REVIEWER_ROLE });

      const reply = await submitSignup(flow, 'none');

      expect(reply.content).toBe(SIGNUP_MESSAGES.MISSING_SIGNUP_REVIEW_CHANNEL);
      expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
    });
  });

  describe('when the FFLogs report is too old', () => {
    it('refuses the signup and explains the age limit', async () => {
      flow.fflogs.reportAge = 'expired';

      const reply = await submitSignup(flow, 'none');

      expect(reply.embeds[0]).toMatchObject({
        title: '❌ FFLogs Check Failed',
        description: expect.stringContaining('must not be older than'),
      });
      expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
    });
  });

  describe('when FFLogs cannot be reached', () => {
    it('lets the signup through for manual review', async () => {
      flow.fflogs.reportAge = 'unreachable';

      await submitSignup(flow);

      expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
        status: SignupStatus.PENDING,
      });
    });
  });

  describe('when the link is an FFLogs page that is not a report', () => {
    it('refuses the signup and shows an example report link', async () => {
      const reply = await submitSignup(flow, 'none', {
        'prog-proof-link': 'https://www.fflogs.com/character/na/jenova/test',
      });

      expect(reply.embeds[0]?.description).toContain(
        'Invalid FFLogs URL format',
      );
      expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
    });
  });

  describe('when the proof is not an FFLogs link', () => {
    it('accepts it without checking FFLogs', async () => {
      await submitSignup(flow, 'confirm', {
        'prog-proof-link': 'https://www.youtube.com/watch?v=abc',
      });

      expect(flow.fflogs.checkedReports).toEqual([]);
      expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
        status: SignupStatus.PENDING,
      });
    });
  });

  describe('when a pending signup is resubmitted', () => {
    it('replaces its review message and stays pending', async () => {
      await submitSignup(flow);
      const firstReview = latestReview(flow);

      await submitSignup(flow, 'confirm', { job: 'healer' });

      expect(firstReview.deleted).toBe(true);
      expect(flow.discord.channel(REVIEW_CHANNEL)).toHaveLength(1);
      expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
        role: 'healer',
        status: SignupStatus.PENDING,
        reviewMessageId: latestReview(flow).id,
      });
    });
  });

  describe('when a submitted signup is reviewed', () => {
    beforeEach(async () => {
      await submitSignup(flow);
    });

    describe('and the reviewer approves it', () => {
      beforeEach(() => approve(flow, { progPoint: 'P6' }));

      it('marks it approved at the chosen prog point', () => {
        expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
          status: SignupStatus.APPROVED,
          progPoint: 'P6',
          partyStatus: PartyStatus.ProgParty,
          reviewedBy: REVIEWER.username,
        });
      });

      it('gives the player the prog role and the prog point role', () => {
        expect(flow.discord.rolesOf(PLAYER.id)).toEqual(
          expect.arrayContaining([DSR_PROG_ROLE, DSR_P6_ROLE]),
        );
      });

      it('adds the player to the spreadsheet', () => {
        expect(flow.sheets.rows(SPREADSHEET)).toEqual([
          expect.objectContaining({
            character: 'test character',
            progPoint: 'P6',
          }),
        ]);
      });

      it('announces the approval in the signup channel', () => {
        expect(
          flow.discord.channel(SIGNUP_CHANNEL).map((m) => m.content),
        ).toEqual([`<@${PLAYER.id}> Signup Approved!`]);
      });

      it('marks the review message as approved by the reviewer', () => {
        expect(latestReview(flow).embeds[0]?.footer?.text).toBe(
          `Approved by ${REVIEWER.username}`,
        );
      });

      it('sends the player no direct message', () => {
        expect(flow.discord.dmsTo(PLAYER.id)).toEqual([]);
      });

      it('ignores a second reviewer reacting afterwards', async () => {
        flow.discord.addMember(OTHER_REVIEWER);

        flow.discord.react(
          latestReview(flow),
          SIGNUP_REVIEW_REACTIONS.APPROVED,
          OTHER_REVIEWER.id,
        );
        await flow.settle();

        expect(flow.discord.dmsTo(OTHER_REVIEWER.id)).toEqual([]);
      });
    });

    describe('and the reviewer approves it with a comment', () => {
      it('DMs the player the comment, quoting every line', async () => {
        await approve(flow, {
          progPoint: 'P6',
          comment: 'Great clear\nSee you in P7',
        });

        expect(flow.discord.latestDmTo(PLAYER.id).content).toContain(
          '> Great clear\n> See you in P7',
        );
      });

      it('does not store the comment', async () => {
        await approve(flow, { progPoint: 'P6', comment: 'Great clear' });

        expect(flow.db.read(SIGNUP_PATH)).not.toHaveProperty('comment');
      });

      it('still approves the signup when the player cannot be DMed', async () => {
        flow.discord.failDirectMessagesTo(PLAYER.id);

        await approve(flow, { progPoint: 'P6', comment: 'Great clear' });

        flow.expectLoggedError(/Cannot send messages to this user/);
        expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
          status: SignupStatus.APPROVED,
        });
      });
    });

    describe('and the reviewer approves it at a clear-party prog point', () => {
      it('swaps the prog role for the clear role', async () => {
        flow.discord.addMember({ ...PLAYER, roles: [DSR_PROG_ROLE] });

        await approve(flow, { progPoint: 'P7' });

        expect(flow.discord.rolesOf(PLAYER.id)).toContain(DSR_CLEAR_ROLE);
        expect(flow.discord.rolesOf(PLAYER.id)).not.toContain(DSR_PROG_ROLE);
      });
    });

    describe('and the reviewer marks it cleared', () => {
      beforeEach(async () => {
        flow.discord.addMember({
          ...PLAYER,
          roles: [DSR_PROG_ROLE, DSR_P6_ROLE],
        });
        await approve(flow, { progPoint: PartyStatus.Cleared });
      });

      it('removes the signup', () => {
        expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
      });

      it("removes the player's encounter roles", () => {
        expect(flow.discord.rolesOf(PLAYER.id)).toEqual([]);
      });

      it('congratulates the player in the signup channel', () => {
        expect(flow.discord.channel(SIGNUP_CHANNEL)[0]?.content).toContain(
          'Congratulations on clearing',
        );
      });
    });

    describe('and the reviewer cancels the approval', () => {
      beforeEach(async () => {
        flow.discord.react(
          latestReview(flow),
          SIGNUP_REVIEW_REACTIONS.APPROVED,
          REVIEWER.id,
        );
        await flow.settle();
        flow.discord.click(
          flow.discord.latestDmTo(REVIEWER.id),
          APPROVAL_CANCEL_BUTTON_ID,
          REVIEWER.id,
        );
        await flow.settle();
      });

      it('leaves the signup pending', () => {
        expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
          status: SignupStatus.PENDING,
        });
      });

      it("removes the reviewer's approve reaction so they can react again", () => {
        expect(
          latestReview(flow)
            .reactions.get(SIGNUP_REVIEW_REACTIONS.APPROVED)
            ?.has(REVIEWER.id),
        ).toBe(false);
      });
    });

    describe('and the reviewer declines it with a reason', () => {
      const reason = SIGNUP_DECLINE_REASONS_CONFIG[0]?.reason ?? '';

      beforeEach(() => decline(flow, reason));

      it('marks it declined with the reason', () => {
        expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
          status: SignupStatus.DECLINED,
          declineReason: reason,
          reviewedBy: REVIEWER.username,
        });
      });

      it('DMs the player the reason', () => {
        expect(flow.discord.latestDmTo(PLAYER.id).content).toContain(
          `**Reason:**\n> ${reason}`,
        );
      });

      it('marks the review message as declined by the reviewer', () => {
        const review = latestReview(flow);

        expect(review.content).toBe(`Declined <@${PLAYER.id}>`);
        expect(review.embeds[0]?.footer?.text).toBe(
          `Declined by ${REVIEWER.username}`,
        );
      });
    });

    describe('and the reviewer declines it with a custom reason', () => {
      const reason = 'Mechanics before P6 were not performed cleanly';

      beforeEach(async () => {
        await decline(flow, CUSTOM_DECLINE_REASON_VALUE);
        flow.discord.submitModal(REVIEWER.id, {
          [CUSTOM_DECLINE_REASON_INPUT_ID]: reason,
        });
        await flow.settle();
      });

      it('marks it declined with the custom reason', () => {
        expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
          status: SignupStatus.DECLINED,
          declineReason: reason,
        });
      });

      it('DMs the player the custom reason', () => {
        expect(flow.discord.latestDmTo(PLAYER.id).content).toContain(
          `**Reason:**\n> ${reason}`,
        );
      });
    });

    describe('and the reviewer declines it but never picks a reason', () => {
      beforeEach(async () => {
        flow.discord.react(
          latestReview(flow),
          SIGNUP_REVIEW_REACTIONS.DECLINED,
          REVIEWER.id,
        );
        await flow.settle();
        flow.discord.expireAll();
        await flow.settle();
      });

      it('marks it declined without a reason', () => {
        expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
          status: SignupStatus.DECLINED,
        });
        expect(flow.db.read(SIGNUP_PATH)).not.toHaveProperty('declineReason');
      });

      it('still tells the player the signup was declined', () => {
        expect(flow.discord.latestDmTo(PLAYER.id).content).toBe(
          SIGNUP_MESSAGES.SIGNUP_SUBMISSION_DENIED,
        );
      });
    });

    describe('and someone without the reviewer role reacts', () => {
      it('ignores the reaction', async () => {
        flow.discord.react(
          latestReview(flow),
          SIGNUP_REVIEW_REACTIONS.APPROVED,
          PLAYER.id,
        );
        await flow.settle();

        expect(flow.discord.dmsTo(PLAYER.id)).toEqual([]);
        expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
          status: SignupStatus.PENDING,
        });
      });
    });

    describe('and the approved signup is resubmitted', () => {
      let approvedReview: FakeMessage;

      beforeEach(async () => {
        await approve(flow, { progPoint: 'P6' });
        approvedReview = latestReview(flow);
        await submitSignup(flow, 'confirm', { 'prog-point': 'P7' });
      });

      // Regression: a unit test once stubbed upsert() to return APPROVED (which
      // it never does), so this protection was "tested" but never ran.
      it('keeps the approved review message as a record of the decision', () => {
        expect(approvedReview.deleted).toBe(false);
        expect(flow.discord.channel(REVIEW_CHANNEL)).toHaveLength(2);
      });

      it('moves it back to review as an update', () => {
        expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
          status: SignupStatus.UPDATE_PENDING,
          progPointRequested: 'P7',
          reviewedBy: null,
        });
      });

      it('shows the reviewer the previously approved prog point', () => {
        expect(latestReview(flow).embeds[0]?.fields).toContainEqual(
          expect.objectContaining({
            name: 'Previously Approved Prog Point',
            value: 'P6',
          }),
        );
      });
    });

    describe('and the declined signup is resubmitted', () => {
      it('keeps the declined review message as a record of the decision', async () => {
        await decline(flow, SIGNUP_DECLINE_REASONS_CONFIG[0]?.reason ?? '');
        const declinedReview = latestReview(flow);

        await submitSignup(flow);

        expect(declinedReview.deleted).toBe(false);
        expect(flow.discord.channel(REVIEW_CHANNEL)).toHaveLength(2);
      });
    });
  });
});
