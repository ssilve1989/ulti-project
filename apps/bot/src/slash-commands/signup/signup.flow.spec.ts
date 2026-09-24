import { Encounter, PartyStatus, SignupStatus } from '@ulti-project/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { FakeMessage } from '../../test-utils/discord/fake-message.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import { SignupCommandHandler } from './handlers/signup.command-handler.js';
import { SIGNUP_MESSAGES, SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';

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
  flow.discord.addChannel(REVIEW_CHANNEL);
  flow.discord.addChannel(SIGNUP_CHANNEL);
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
});
