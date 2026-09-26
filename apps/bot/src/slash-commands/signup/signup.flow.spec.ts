import {
  Encounter,
  EncounterEmoji,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import {
  type APIEmbedField,
  ButtonStyle,
  Colors,
  ComponentType,
  TextInputStyle,
} from 'discord.js';
import { titleCase } from 'title-case';
import { test as base, describe, expect } from 'vitest';
import { ClearReactions } from '../../common/emojis/emojis.js';
import { PROG_POINT_SELECT_ID } from '../../encounters/encounters.components.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import {
  avatarUrl,
  BOT_USER_ID,
} from '../../test-utils/discord/discord-mock.js';
import {
  type FakeMessage,
  reactionsOn,
  shown,
} from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import { isoDateSince, signupExpiryFor } from '../../test-utils/matchers.js';
import { stableTestKey } from '../../test-utils/sheets/recorded-sheets.js';
import {
  APPROVAL_CANCEL_BUTTON_ID,
  APPROVAL_COMMENT_INPUT_ID,
  APPROVAL_COMMENT_MODAL_ID,
  APPROVE_BUTTON_ID,
  APPROVE_WITH_COMMENT_BUTTON_ID,
} from './approval-decision.components.js';
import {
  CUSTOM_DECLINE_REASON_INPUT_ID,
  CUSTOM_DECLINE_REASON_MODAL_ID,
  DECLINE_REASON_SELECT_ID,
} from './decline-reason.components.js';
import {
  CUSTOM_DECLINE_REASON_VALUE,
  FFLOGS_REPORT_MAX_AGE_DAYS,
  SIGNUP_DECLINE_REASONS_CONFIG,
  SIGNUP_MESSAGES,
  SIGNUP_REVIEW_REACTIONS,
} from './signup.consts.js';

const GUILD = 'guild-1';
const REVIEW_CHANNEL = 'review-channel';
const SIGNUP_CHANNEL = 'signup-channel';
const BLACKLIST_CHANNEL = 'blacklist-channel';
const REVIEWER_ROLE = 'reviewer-role';
const DMU_PROG_ROLE = 'dmu-prog-role';
const DMU_CLEAR_ROLE = 'dmu-clear-role';
const DMU_P6_ROLE = 'dmu-p6-role';
const DMU_P7_ROLE = 'dmu-p7-role';

const PLAYER = Object.freeze({
  id: 'player-1',
  username: 'player',
  displayName: 'Test Character',
});
const REVIEWER = Object.freeze({
  id: 'reviewer-1',
  username: 'reviewer',
  displayName: 'Rev Iewer',
  roles: Object.freeze([REVIEWER_ROLE]),
});
const OTHER_REVIEWER = Object.freeze({
  id: 'reviewer-2',
  username: 'reviewer2',
  roles: Object.freeze([REVIEWER_ROLE]),
});

const SIGNUP_PATH = `signups/${SignupCollection.getKeyForSignup({
  discordId: PLAYER.id,
  encounter: Encounter.DMU,
})}`;

/**
 * The running test's character: unique per test, so rows on the shared test
 * spreadsheet never collide, and stable across runs, so recordings replay.
 */
const character = () => `flow ${stableTestKey()}`;

/** The character as the bot shows it in embeds. */
const shownCharacter = () => titleCase(character());

const WORLD = 'Jenova';
const PROOF_LINK = 'https://www.fflogs.com/reports/abc123';
const ENCOUNTER_NAME = 'Dancing Mad (Ultimate)';
/** The encounter's emoji, and the reactions the bot adds to a congratulation. */
const ENCOUNTER_EMOJI = Object.freeze({
  id: EncounterEmoji[Encounter.DMU] ?? '',
  name: 'dmu',
});
const CLEAR_EMOJIS = Object.freeze(
  ClearReactions.map((name, index) =>
    Object.freeze({ id: `clear-${index}`, name }),
  ),
);
const DECLINE_REASON = SIGNUP_DECLINE_REASONS_CONFIG[0]?.reason ?? '';

const SIGNUP_OPTIONS: Readonly<Record<string, string | null>> = Object.freeze({
  encounter: Encounter.DMU,
  world: WORLD,
  job: 'tank',
  'prog-point': 'P6',
  'prog-proof-link': PROOF_LINK,
  notes: null,
});

/** A guild configured for DMU signups, with a player and a reviewer. */
function givenAGuild(flow: FlowApp): void {
  flow.db.seed(`settings/${GUILD}`, {
    reviewChannel: REVIEW_CHANNEL,
    reviewerRole: REVIEWER_ROLE,
    signupChannel: SIGNUP_CHANNEL,
    blacklistChannelIds: [BLACKLIST_CHANNEL],
    spreadsheetId: flow.sheets.spreadsheetId,
    progRoles: { DMU: DMU_PROG_ROLE },
    clearRoles: { DMU: DMU_CLEAR_ROLE },
    progPointRoles: { DMU: { P6: DMU_P6_ROLE, P7: DMU_P7_ROLE } },
  });
  flow.db.seed(`encounters/${Encounter.DMU}`, {
    name: 'DMU',
    description: 'Dancing Mad',
    active: true,
  });
  flow.db.seed(`encounters/${Encounter.DMU}/prog-points/P6`, {
    id: 'P6',
    label: 'P6 Enrage',
    partyStatus: PartyStatus.ProgParty,
    order: 0,
    active: true,
  });
  flow.db.seed(`encounters/${Encounter.DMU}/prog-points/P7`, {
    id: 'P7',
    label: 'P7 Final Phase',
    partyStatus: PartyStatus.ClearParty,
    order: 1,
    active: true,
  });
  flow.discord.addChannel(GUILD, REVIEW_CHANNEL);
  flow.discord.addChannel(GUILD, SIGNUP_CHANNEL);
  flow.discord.addChannel(GUILD, BLACKLIST_CHANNEL);
  flow.discord.addMember(PLAYER);
  flow.discord.addMember(REVIEWER);
  for (const emoji of [ENCOUNTER_EMOJI, ...CLEAR_EMOJIS]) {
    flow.discord.addEmoji(emoji);
  }
  flow.fflogs.addReport('abc123', { daysAgo: 3 });
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
        // remove whatever this test wrote to the shared spreadsheet
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
        // always close, or this app's listeners leak into the next test
        await flow.close();
      }
    },
  ),
});

/** The player runs /signup; returns their reply once the bot has answered. */
async function startSignup(
  flow: FlowApp,
  overrides: Record<string, string | null> = {},
  attachments: Record<string, { url: string }> = {},
): Promise<() => FakeMessage> {
  const { reply } = flow.discord.command({
    userId: PLAYER.id,
    guildId: GUILD,
    commandName: 'signup',
    options: { ...SIGNUP_OPTIONS, character: character(), ...overrides },
    attachments,
  });
  await flow.settle();
  return reply;
}

type Answer = 'confirm' | 'cancel' | 'timeout' | 'none';

/**
 * Runs /signup as the player and answers the confirmation prompt. Use 'none'
 * when the bot rejects the signup before prompting.
 */
async function submitSignup(
  flow: FlowApp,
  answer: Answer = 'confirm',
  overrides: Record<string, string | null> = {},
  attachments: Record<string, { url: string }> = {},
): Promise<void> {
  const reply = await startSignup(flow, overrides, attachments);

  if (answer === 'confirm' || answer === 'cancel') {
    flow.discord.click(reply(), answer, PLAYER.id);
  } else {
    // 'none' expires too: a prompt the test didn't expect then fails the
    // assertions immediately instead of hanging until the test times out
    flow.discord.expireAll();
  }

  await flow.settle();
}

function latestReview(flow: FlowApp): FakeMessage {
  const review = flow.discord.channel(REVIEW_CHANNEL).at(-1);
  if (!review) throw new Error('No review message was posted');
  return review;
}

/** Someone reacts to the latest review message, and the bot handles it. */
async function reactToReview(
  flow: FlowApp,
  emoji: string,
  userId: string = REVIEWER.id,
): Promise<void> {
  flow.discord.react(latestReview(flow), emoji, userId);
  await flow.settle();
}

/** The reviewer picks `progPoint` in the approval prompt they were DMed. */
async function chooseProgPoint(flow: FlowApp, progPoint: string) {
  flow.discord.choose(
    flow.discord.latestDmTo(REVIEWER.id),
    progPoint,
    REVIEWER.id,
  );
  await flow.settle();
}

/** The reviewer presses `buttonId` in the approval prompt they were DMed. */
async function pressInApprovalPrompt(flow: FlowApp, buttonId: string) {
  flow.discord.click(
    flow.discord.latestDmTo(REVIEWER.id),
    buttonId,
    REVIEWER.id,
  );
  await flow.settle();
}

/** The reviewer cancels their approval prompt, e.g. once a test is done with it, so it doesn't time out. */
const cancelApprovalPrompt = (flow: FlowApp) =>
  pressInApprovalPrompt(flow, APPROVAL_CANCEL_BUTTON_ID);

/** The reviewer approves the latest review at `progPoint`, optionally leaving a comment. */
async function approve(
  flow: FlowApp,
  { progPoint, comment }: { progPoint: string; comment?: string },
): Promise<void> {
  await reactToReview(flow, SIGNUP_REVIEW_REACTIONS.APPROVED);
  await chooseProgPoint(flow, progPoint);

  if (comment === undefined) {
    await pressInApprovalPrompt(flow, APPROVE_BUTTON_ID);
  } else {
    await pressInApprovalPrompt(flow, APPROVE_WITH_COMMENT_BUTTON_ID);
    flow.discord.submitModal(REVIEWER.id, {
      [APPROVAL_COMMENT_INPUT_ID]: comment,
    });
    await flow.settle();
  }
}

/** The reviewer declines the latest review and picks `reason`. */
async function decline(flow: FlowApp, reason: string): Promise<void> {
  await reactToReview(flow, SIGNUP_REVIEW_REACTIONS.DECLINED);

  flow.discord.choose(
    flow.discord.latestDmTo(REVIEWER.id),
    reason,
    REVIEWER.id,
  );
  await flow.settle();
}

/** The DMU tab of the test spreadsheet. */
const DMU_TAB_ID = 695983618;

/** The DMU tab's party sections: their columns, and those as zero-based indexes. */
const PROG_PARTY: Section = Object.freeze({
  start: 'I',
  end: 'L',
  from: 8,
  to: 12,
});
const CLEAR_PARTY: Section = Object.freeze({
  start: 'C',
  end: 'F',
  from: 2,
  to: 6,
});
interface Section {
  readonly start: string;
  readonly end: string;
  readonly from: number;
  readonly to: number;
}

/**
 * The row after the last filled one in `section` when the app read it (its
 * `read`-th read): where the app should add a new signup.
 */
function nextFreeRow(flow: FlowApp, section: Section, read = 0): number {
  const values = flow.sheets.valuesRead(`DMU!${section.start}:${section.end}`)[
    read
  ];
  if (!Array.isArray(values)) {
    throw new Error(
      `The app never read section ${section.start}:${section.end}`,
    );
  }
  return values.length + 1;
}

/** The request writing this test's player into `row` of `section` at `progPoint`. */
const rowWritten = (
  flow: FlowApp,
  section: Section,
  row: number,
  progPoint: string,
) => ({
  method: 'PUT',
  path: `/v4/spreadsheets/${flow.sheets.spreadsheetId}/values/DMU!${section.start}${row}:${section.end}?valueInputOption=USER_ENTERED`,
  body: { values: [[shownCharacter(), WORLD, 'tank', progPoint]] },
});

/** The request rewriting this test's player's existing `row` of `section` at `progPoint`. */
const rowUpdated = (
  flow: FlowApp,
  section: Section,
  row: number,
  progPoint: string,
) => ({
  ...rowWritten(flow, section, row, progPoint),
  path: `/v4/spreadsheets/${flow.sheets.spreadsheetId}/values/DMU!${section.start}${row}:${section.end}${row}?valueInputOption=USER_ENTERED`,
});

/** The request clearing `row` of `section` (Sheets indexes are zero-based, end-exclusive). */
const rowCleared = (flow: FlowApp, section: Section, row: number) => ({
  method: 'POST',
  path: `/v4/spreadsheets/${flow.sheets.spreadsheetId}:batchUpdate`,
  body: {
    requests: [
      {
        updateCells: {
          range: {
            sheetId: DMU_TAB_ID,
            startRowIndex: row - 1,
            endRowIndex: row,
            startColumnIndex: section.from,
            endColumnIndex: section.to,
          },
          fields: 'userEnteredValue',
        },
      },
    ],
  },
});

// --- what users see

const IN_REVIEW_CHANNEL = Object.freeze({
  kind: 'channel',
  guildId: GUILD,
  channelId: REVIEW_CHANNEL,
});
const IN_BLACKLIST_CHANNEL = Object.freeze({
  kind: 'channel',
  guildId: GUILD,
  channelId: BLACKLIST_CHANNEL,
});
const IN_SIGNUP_CHANNEL = Object.freeze({
  kind: 'channel',
  guildId: GUILD,
  channelId: SIGNUP_CHANNEL,
});
const dmTo = (userId: string) => ({ kind: 'dm', userId });
const replyTo = (userId: string, { ephemeral }: { ephemeral: boolean }) => ({
  kind: 'reply',
  userId,
  ephemeral,
});

/** A text-only answer to one of `userId`'s interactions. */
const textReply = (
  userId: string,
  content: string,
  { ephemeral }: { ephemeral: boolean },
) => ({
  location: replyTo(userId, { ephemeral }),
  reactions: {},
  deleted: false,
  content,
  embeds: [],
  components: [],
});

const EMPTY_FIELD = Object.freeze({
  name: '​',
  value: '​',
  inline: true,
});
/** How the bot mentions the encounter's emoji. */
const EMOJI_MENTION = `<:_:${ENCOUNTER_EMOJI.id}>`;
const REVIEW_TITLE = `Signup Approval - ${ENCOUNTER_NAME} ${EMOJI_MENTION}`;
const REVIEW_PROMPT =
  'Please react to approve ✅ or deny ❌ the following applicants request';

interface ShownSignup {
  job?: string;
  progPoint?: string;
  previouslyApproved?: string;
  proof?: string;
  notes?: string;
  screenshot?: string;
}

/** An embed's image, when the signup has a screenshot. */
const imageOf = (screenshot: string | undefined) =>
  screenshot === undefined ? {} : { image: { url: screenshot } };

/** The signup as the review message, the reviewer's prompt and the decline DM list it. */
function reviewFields({
  job = 'tank',
  progPoint = 'P6',
  previouslyApproved,
  proof = PROOF_LINK,
  notes,
}: ShownSignup = {}): APIEmbedField[] {
  return [
    { name: 'Character', value: shownCharacter(), inline: true },
    { name: 'Home World', value: WORLD, inline: true },
    { name: 'Job', value: job, inline: true },
    { name: 'Prog Point', value: progPoint, inline: true },
    ...(previouslyApproved === undefined
      ? []
      : [
          {
            name: 'Previously Approved Prog Point',
            value: previouslyApproved,
            inline: true,
          },
        ]),
    { name: 'Prog Proof Link', value: `[View](${proof})`, inline: true },
    ...(notes === undefined
      ? []
      : [{ name: 'Notes', value: notes, inline: false }]),
  ];
}

const reviewEmbed = (signup: ShownSignup = {}) => ({
  title: REVIEW_TITLE,
  description: REVIEW_PROMPT,
  fields: reviewFields(signup),
  thumbnail: { url: avatarUrl(PLAYER.id) },
  ...imageOf(signup.screenshot),
});

/** How the bot stamps an embed with the reviewer's decision. */
const decidedBy = (flow: FlowApp, decision: 'Approved' | 'Declined') => ({
  color: decision === 'Approved' ? Colors.Green : Colors.Red,
  footer: {
    text: `${decision} by ${REVIEWER.displayName}`,
    icon_url: avatarUrl(REVIEWER.id),
  },
  timestamp: isoDateSince(flow.startedAt),
});

/** Reactions on a review message, by emoji, in the order users added them. */
interface ReviewReactions {
  approved?: readonly string[];
  declined?: readonly string[];
}

/** The review's reactions: the bot's own ✅ and ❌, then whoever else reacted. */
const reviewReactions = ({
  approved = [],
  declined = [],
}: ReviewReactions) => ({
  [SIGNUP_REVIEW_REACTIONS.APPROVED]: [BOT_USER_ID, ...approved],
  [SIGNUP_REVIEW_REACTIONS.DECLINED]: [BOT_USER_ID, ...declined],
});

const pendingReview = (
  signup?: ShownSignup,
  reactions: ReviewReactions = {},
) => ({
  location: IN_REVIEW_CHANNEL,
  reactions: reviewReactions(reactions),
  deleted: false,
  content: `Signup Review for <@${PLAYER.id}>`,
  embeds: [reviewEmbed(signup)],
  components: [],
});

/** A review the reviewer approved, with their ✅ on it. */
const approvedReview = (
  flow: FlowApp,
  signup?: ShownSignup,
  reactions: ReviewReactions = { approved: [REVIEWER.id] },
) => ({
  location: IN_REVIEW_CHANNEL,
  reactions: reviewReactions(reactions),
  deleted: false,
  content: `Signup Review for <@${PLAYER.id}>`,
  embeds: [
    {
      title: REVIEW_TITLE,
      fields: reviewFields(signup),
      thumbnail: { url: avatarUrl(PLAYER.id) },
      ...decidedBy(flow, 'Approved'),
    },
  ],
  components: [],
});

/** A review the reviewer declined, with their ❌ on it. */
const declinedReview = (flow: FlowApp) => ({
  location: IN_REVIEW_CHANNEL,
  reactions: reviewReactions({ declined: [REVIEWER.id] }),
  deleted: false,
  content: `Declined <@${PLAYER.id}>`,
  embeds: [
    {
      title: REVIEW_TITLE,
      fields: reviewFields(),
      thumbnail: { url: avatarUrl(PLAYER.id) },
      ...decidedBy(flow, 'Declined'),
    },
  ],
  components: [],
});

/** What the bot posts in the signup channel for an approval at `progPoint`. */
const approvalAnnouncement = (
  flow: FlowApp,
  {
    progPoint = 'P6',
    title = `Signup Approved - ${ENCOUNTER_NAME} ${EMOJI_MENTION}`,
    content = `<@${PLAYER.id}> Signup Approved!`,
    screenshot,
    reactions = {},
  }: {
    progPoint?: string;
    title?: string;
    content?: string;
    screenshot?: string;
    reactions?: Record<string, string[]>;
  } = {},
) => ({
  location: IN_SIGNUP_CHANNEL,
  reactions,
  deleted: false,
  content,
  embeds: [
    {
      title,
      fields: [
        { name: 'Character', value: shownCharacter(), inline: true },
        { name: 'World', value: WORLD, inline: true },
        { name: 'Job', value: 'tank', inline: true },
        { name: 'Prog Point', value: progPoint, inline: true },
        EMPTY_FIELD,
        {
          name: 'Prog Proof Link',
          value: `[View](${PROOF_LINK})`,
          inline: true,
        },
      ],
      thumbnail: { url: avatarUrl(PLAYER.id) },
      ...imageOf(screenshot),
      ...decidedBy(flow, 'Approved'),
    },
  ],
  components: [],
});

/** The summary the player is asked to confirm. */
function confirmationPrompt({
  nameWarning,
  notes,
  screenshot,
}: {
  nameWarning: boolean;
  notes?: string;
  screenshot?: string;
}) {
  const warning = {
    name: '⚠️ Name Mismatch Warning',
    value: `Your Discord display name \`${PLAYER.displayName}\` doesn't match your submitted character name \`${shownCharacter()}\`. **This reduces your chances of being picked for a run.** Please be sure this is correct before confirming.\n\nNames can be updated by visiting the https://discord.com/channels/@me/1264643007848906884 channel. Please refer to the pinned FAQ for more information.`,
    inline: false,
  };

  return {
    location: replyTo(PLAYER.id, { ephemeral: true }),
    reactions: {},
    deleted: false,
    content: undefined,
    embeds: [
      {
        title: ENCOUNTER_NAME,
        description: "Here's a summary of your signup request",
        fields: [
          { name: 'Character', value: shownCharacter(), inline: true },
          { name: 'Home World', value: WORLD, inline: true },
          { name: 'Job', value: 'tank', inline: true },
          { name: 'Prog Point', value: 'P6', inline: true },
          EMPTY_FIELD,
          { name: 'Prog Proof Link', value: PROOF_LINK, inline: true },
          ...(notes === undefined
            ? []
            : [{ name: 'Notes', value: notes, inline: false }]),
          ...(nameWarning ? [warning] : []),
        ],
        ...imageOf(screenshot),
      },
    ],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            custom_id: 'confirm',
            label: 'Confirm',
            style: ButtonStyle.Success,
          },
          {
            type: ComponentType.Button,
            custom_id: 'cancel',
            label: 'Cancel',
            style: ButtonStyle.Primary,
          },
        ],
      },
    ],
  };
}

/** The prog point menu in the reviewer's approval prompt. */
function progPointMenu(selected?: string) {
  const option = (label: string, value: string) =>
    selected === undefined
      ? { label, value }
      : { label, value, default: value === selected };

  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.StringSelect,
        custom_id: PROG_POINT_SELECT_ID,
        options: [
          option('P6 Enrage', 'P6'),
          option('P7 Final Phase', 'P7'),
          option('Cleared', PartyStatus.Cleared),
        ],
      },
    ],
  };
}

/** The approval prompt's buttons; approving needs a prog point chosen first. */
function approvalButtons({ canApprove }: { canApprove: boolean }) {
  const button = (
    custom_id: string,
    label: string,
    style: ButtonStyle,
    disabled: boolean,
  ) => ({ type: ComponentType.Button, custom_id, label, style, disabled });

  return {
    type: ComponentType.ActionRow,
    components: [
      button(APPROVE_BUTTON_ID, 'Approve', ButtonStyle.Success, !canApprove),
      button(
        APPROVE_WITH_COMMENT_BUTTON_ID,
        'Approve with Comment',
        ButtonStyle.Primary,
        !canApprove,
      ),
      button(APPROVAL_CANCEL_BUTTON_ID, 'Cancel', ButtonStyle.Danger, false),
    ],
  };
}

/** The approval prompt DMed to the reviewer for `signup`, with `components` as its controls. */
const approvalPrompt = (components: unknown[], signup?: ShownSignup) => ({
  location: dmTo(REVIEWER.id),
  reactions: {},
  deleted: false,
  content: 'Please confirm the prog point of the following signup',
  embeds: [reviewEmbed(signup)],
  components,
});

/** The prompt DMed to a declining reviewer; its reason menu goes once the prompt ends. */
const declineReasonPrompt = ({ withMenu }: { withMenu: boolean }) => ({
  location: dmTo(REVIEWER.id),
  reactions: {},
  deleted: false,
  content: undefined,
  embeds: [
    {
      title: 'Decline Reason Required',
      description: `You have declined the signup from **${PLAYER.username}** for **${Encounter.DMU}**.`,
      fields: [
        {
          name: 'Next Steps',
          value:
            'Please select a reason for declining this signup from the dropdown below. This will help provide better feedback to the user.',
        },
      ],
      color: Colors.Orange,
      footer: { text: 'This request will timeout in 5 minutes' },
    },
  ],
  components: !withMenu
    ? []
    : [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: `${DECLINE_REASON_SELECT_ID}-${PLAYER.id}-${Encounter.DMU}`,
              placeholder: 'Select a reason for declining this signup',
              options: [
                ...SIGNUP_DECLINE_REASONS_CONFIG.map(({ reason }) => ({
                  label: reason,
                  value: reason,
                })),
                {
                  label: 'Other - provide custom reason',
                  value: CUSTOM_DECLINE_REASON_VALUE,
                },
              ],
            },
          ],
        },
      ],
});

/** The DM telling the player their signup was declined. */
const declineDm = (flow: FlowApp, content: string) => ({
  location: dmTo(PLAYER.id),
  reactions: {},
  deleted: false,
  content,
  embeds: [
    {
      title: 'Signup Declined',
      fields: reviewFields(),
      thumbnail: { url: avatarUrl(PLAYER.id) },
      ...decidedBy(flow, 'Declined'),
    },
  ],
  components: [],
});

/** The decline DM's text for a reason the player can fix and resubmit. */
const declinedFor = (
  reason: string,
  followUp = "Please review the feedback above and feel free to submit a new signup once you've addressed the concerns. Thank you for your understanding! 🙏",
) =>
  `We're sorry, but your signup for **${Encounter.DMU}** could not be approved.\n\n**Reason:**\n> ${reason}\n\n${followUp}`;

/** A one-paragraph-input modal as Discord receives it. */
const textModal = (
  customId: string,
  title: string,
  input: {
    custom_id: string;
    label: string;
    placeholder: string;
    required: boolean;
  },
) => ({
  custom_id: customId,
  title,
  components: [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.TextInput,
          style: TextInputStyle.Paragraph,
          max_length: 500,
          ...input,
        },
      ],
    },
  ],
});

/** The signup document as stored, for this test's player and character. */
const storedSignup = (flow: FlowApp, changes: Partial<SignupDocument>) => ({
  character: character(),
  discordId: PLAYER.id,
  role: 'tank',
  progPointRequested: 'P6',
  encounter: Encounter.DMU,
  notes: null,
  proofOfProgLink: PROOF_LINK,
  screenshot: null,
  username: PLAYER.username,
  world: WORLD.toLowerCase(),
  expiresAt: signupExpiryFor(flow.startedAt),
  status: SignupStatus.PENDING,
  ...changes,
});

/** The FFLogs check's refusal, as the player's reply shows it. */
const fflogsRefusal = (flow: FlowApp, description: string) => ({
  location: replyTo(PLAYER.id, { ephemeral: true }),
  reactions: {},
  deleted: false,
  content: undefined,
  embeds: [
    {
      title: '❌ FFLogs Check Failed',
      description,
      color: Colors.Red,
      timestamp: isoDateSince(flow.startedAt),
    },
  ],
  components: [],
});

describe('Signup lifecycle', () => {
  describe('when a player starts a signup', () => {
    /** Starts /signup and returns the prompt the player saw, then cancels it. */
    async function promptShown(flow: FlowApp) {
      const reply = await startSignup(flow);
      const prompt = structuredClone(shown(reply()));

      // answer, so the command finishes
      flow.discord.click(reply(), 'cancel', PLAYER.id);
      await flow.settle();
      return prompt;
    }

    it('asks them, privately, to confirm a summary of it', async ({ flow }) => {
      flow.discord.addMember({ ...PLAYER, displayName: shownCharacter() });

      await expect(promptShown(flow)).resolves.toEqual(
        confirmationPrompt({ nameWarning: false }),
      );
    });

    it('warns them when their display name does not match the character', async ({
      flow,
    }) => {
      await expect(promptShown(flow)).resolves.toEqual(
        confirmationPrompt({ nameWarning: true }),
      );
    });
  });

  describe('when a player confirms a signup', () => {
    // Discord fails an interaction the bot doesn't acknowledge within 3
    // seconds, so the click is answered before any slow work starts
    it('acknowledges the click before storing anything', async ({ flow }) => {
      const unacknowledgedAtEachWrite: string[][] = [];
      const stop = flow.db.onWrite(() =>
        unacknowledgedAtEachWrite.push(flow.discord.unacknowledged()),
      );

      await submitSignup(flow);
      stop();

      // the signup, then its review message id
      expect(unacknowledgedAtEachWrite).toEqual([[], []]);
    });
  });

  describe('when a player submits a signup and confirms', () => {
    it.beforeEach(async ({ flow }) => {
      await submitSignup(flow);
    });

    it('stores it as pending, linked to its review message', ({ flow }) => {
      expect(flow.db.read(SIGNUP_PATH)).toEqual(
        storedSignup(flow, { reviewMessageId: latestReview(flow).id }),
      );
    });

    it('tells the player, privately, it was received', ({ flow }) => {
      expect(flow.discord.repliesTo(PLAYER.id).map(shown)).toEqual([
        textReply(PLAYER.id, SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CONFIRMED, {
          ephemeral: true,
        }),
      ]);
    });

    it('posts it for review with approve and decline reactions', ({ flow }) => {
      expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
        pendingReview(),
      ]);
    });
  });

  /**
   * Blacklists someone else, by both discord id and character name. Its id
   * sorts before the player's entry, so a search that ignored who it's
   * looking for would find this one first.
   */
  const blacklistSomeoneElse = (flow: FlowApp) =>
    flow.db.seed(`blacklist/${GUILD}/documents/a-someone-else`, {
      characterName: 'someone else',
      discordId: 'someone-else',
      reason: 'Spam',
      lodestoneId: null,
    });

  describe('when a player who is not blacklisted submits a signup', () => {
    it('raises no blacklist alert', async ({ flow }) => {
      blacklistSomeoneElse(flow);

      await submitSignup(flow);

      // the review is what triggers the blacklist check
      expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
        pendingReview(),
      ]);
      expect(flow.discord.channel(BLACKLIST_CHANNEL)).toEqual([]);
    });
  });

  describe('when a blacklisted player submits a signup', () => {
    it('alerts the blacklist channel about them alone, linking the review', async ({
      flow,
    }) => {
      blacklistSomeoneElse(flow);
      flow.db.seed(`blacklist/${GUILD}/documents/entry-1`, {
        characterName: null,
        discordId: PLAYER.id,
        reason: 'Harassment',
        lodestoneId: 12345,
      });

      await submitSignup(flow);

      const review = latestReview(flow);
      expect(flow.discord.channel(BLACKLIST_CHANNEL).map(shown)).toEqual([
        {
          location: IN_BLACKLIST_CHANNEL,
          reactions: {},
          deleted: false,
          content: undefined,
          embeds: [
            {
              title: 'Blacklisted User Detected',
              description: 'A blacklisted user has been detected signing up',
              fields: [
                {
                  name: 'Player',
                  value: titleCase(`${PLAYER.displayName} (<@${PLAYER.id}>)`),
                  inline: true,
                },
                { name: 'Reason', value: 'Harassment', inline: true },
                { name: 'Lodestone ID', value: '12345', inline: true },
                {
                  name: 'Signup',
                  value: `https://discord.com/channels/${GUILD}/${REVIEW_CHANNEL}/${review.id}`,
                  inline: true,
                },
              ],
              timestamp: isoDateSince(flow.startedAt),
            },
          ],
          components: [],
        },
      ]);
    });
  });

  describe('when the player cancels', () => {
    it('stores nothing, posts no review and says it was cancelled', async ({
      flow,
    }) => {
      await submitSignup(flow, 'cancel');

      expect(flow.discord.repliesTo(PLAYER.id).map(shown)).toEqual([
        textReply(PLAYER.id, SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CANCELLED, {
          ephemeral: true,
        }),
      ]);
      expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
      expect(flow.discord.channel(REVIEW_CHANNEL)).toEqual([]);
    });
  });

  describe('when the player does not answer in time', () => {
    it('stores nothing and says the confirmation timed out', async ({
      flow,
    }) => {
      await submitSignup(flow, 'timeout');

      flow.expectReported(/^Sentry exception: .*InteractionCollectorError/);
      flow.expectReported(
        /^error: \{\n\s+err: DiscordjsError \[InteractionCollectorError\]/,
      );
      flow.expectReported(
        /^error: .*Command error: Collector received no interactions/,
      );
      expect(flow.discord.repliesTo(PLAYER.id).map(shown)).toEqual([
        textReply(PLAYER.id, SIGNUP_MESSAGES.CONFIRMATION_TIMEOUT, {
          ephemeral: true,
        }),
      ]);
      expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
    });
  });

  describe('when no review channel is configured', () => {
    it('refuses the signup and asks the player to contact an administrator', async ({
      flow,
    }) => {
      flow.db.seed(`settings/${GUILD}`, { reviewerRole: REVIEWER_ROLE });

      await submitSignup(flow, 'none');

      expect(flow.discord.repliesTo(PLAYER.id).map(shown)).toEqual([
        textReply(PLAYER.id, SIGNUP_MESSAGES.MISSING_SIGNUP_REVIEW_CHANNEL, {
          ephemeral: true,
        }),
      ]);
      expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
    });
  });

  describe('when the FFLogs report is too old', () => {
    it('refuses the signup and explains the age limit', async ({ flow }) => {
      flow.fflogs.addReport('abc123', {
        daysAgo: FFLOGS_REPORT_MAX_AGE_DAYS + 1,
      });

      await submitSignup(flow, 'none');

      expect(flow.discord.repliesTo(PLAYER.id).map(shown)).toEqual([
        fflogsRefusal(
          flow,
          `FFLogs reports must not be older than ${FFLOGS_REPORT_MAX_AGE_DAYS} days. The linked report is ${FFLOGS_REPORT_MAX_AGE_DAYS + 1} days old.`,
        ),
      ]);
      expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
    });
  });

  describe('when FFLogs cannot be reached', () => {
    it('lets the signup through for manual review, even with a report too old to accept', async ({
      flow,
    }) => {
      // a reachable FFLogs would refuse this report
      flow.fflogs.addReport('abc123', {
        daysAgo: FFLOGS_REPORT_MAX_AGE_DAYS + 1,
      });
      flow.fflogs.goOffline();

      await submitSignup(flow);

      flow.expectReported(/^warning: fetch failed/);
      flow.expectReported(/^Sentry warning: FFLogs API Failure/);
      expect(flow.fflogs.requestedReports).toEqual(['abc123']);
      expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
        pendingReview(),
      ]);
      expect(flow.db.read(SIGNUP_PATH)).toEqual(
        storedSignup(flow, { reviewMessageId: latestReview(flow).id }),
      );
    });
  });

  describe('when the FFLogs report does not exist', () => {
    // The FFLogs API answers with a GraphQL error, which the SDK throws, so
    // FFLogsService treats it like an outage and lets the signup through.
    it('lets the signup through for manual review', async ({ flow }) => {
      const proof = 'https://www.fflogs.com/reports/doesNotExist';

      await submitSignup(flow, 'confirm', { 'prog-proof-link': proof });

      flow.expectReported(/^warning: This report does not exist/);
      flow.expectReported(/^Sentry warning: FFLogs API Failure/);
      expect(flow.fflogs.requestedReports).toEqual(['doesNotExist']);
      expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
        pendingReview({ proof }),
      ]);
      expect(flow.db.read(SIGNUP_PATH)).toEqual(
        storedSignup(flow, {
          proofOfProgLink: proof,
          reviewMessageId: latestReview(flow).id,
        }),
      );
    });
  });

  describe('when the link is an FFLogs page that is not a report', () => {
    it('refuses the signup and shows an example report link', async ({
      flow,
    }) => {
      await submitSignup(flow, 'none', {
        'prog-proof-link': 'https://www.fflogs.com/character/na/jenova/test',
      });

      expect(flow.discord.repliesTo(PLAYER.id).map(shown)).toEqual([
        fflogsRefusal(
          flow,
          'Invalid FFLogs URL format. Please provide a valid link to a report. Not a profile or any other fflogs link.\n\n            Example: https://www.fflogs.com/reports/2XG7tZp1AjQcWTn9?fight=3&type=damage-done\n            ',
        ),
      ]);
      expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
    });
  });

  describe('when the proof is not an FFLogs link', () => {
    it('accepts it without checking FFLogs', async ({ flow }) => {
      const proof = 'https://www.youtube.com/watch?v=abc';

      await submitSignup(flow, 'confirm', { 'prog-proof-link': proof });

      expect(flow.fflogs.requestedReports).toEqual([]);
      expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
        pendingReview({ proof }),
      ]);
      expect(flow.db.read(SIGNUP_PATH)).toEqual(
        storedSignup(flow, {
          proofOfProgLink: proof,
          reviewMessageId: latestReview(flow).id,
        }),
      );
    });
  });

  describe('when Firestore cannot be reached', () => {
    it('replies with a command error, privately', async ({ flow }) => {
      flow.db.goOffline();

      await startSignup(flow);

      flow.expectReported(/^Sentry exception: Error: 14 UNAVAILABLE/);
      flow.expectReported(/^error: \{\n\s+err: Error: 14 UNAVAILABLE/);
      flow.expectReported(/^error: .*Command error: 14 UNAVAILABLE/);
      expect(flow.discord.repliesTo(PLAYER.id).map(shown)).toEqual([
        {
          location: replyTo(PLAYER.id, { ephemeral: true }),
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

  describe('when the details are invalid', () => {
    it('refuses the signup and lists what to correct', async ({ flow }) => {
      await submitSignup(flow, 'none', { world: 'Moogle' });

      expect(flow.discord.repliesTo(PLAYER.id).map(shown)).toEqual([
        {
          location: replyTo(PLAYER.id, { ephemeral: true }),
          reactions: {},
          deleted: false,
          content: undefined,
          embeds: [
            {
              title: 'Error',
              color: Colors.Red,
              description: 'Please correct the following errors',
              fields: [
                {
                  name: 'Error #1',
                  value:
                    'Invalid World. Please check the spelling and make sure it is a valid world in the NA Region',
                },
              ],
            },
          ],
          components: [],
        },
      ]);
      expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
    });
  });

  describe('when a player adds notes and a screenshot', () => {
    const notes = 'Only free on weekends';
    const screenshot = 'https://cdn.example/attachments/proof.png';
    const withExtras = async (flow: FlowApp, answer: Answer) =>
      submitSignup(
        flow,
        answer,
        { notes },
        { screenshot: { url: screenshot } },
      );

    it('shows them in the summary the player confirms', async ({ flow }) => {
      const reply = await startSignup(
        flow,
        { notes },
        { screenshot: { url: screenshot } },
      );
      const prompt = structuredClone(shown(reply()));
      // answer, so the command finishes
      flow.discord.click(reply(), 'cancel', PLAYER.id);
      await flow.settle();

      expect(prompt).toEqual(
        confirmationPrompt({ nameWarning: true, notes, screenshot }),
      );
    });

    it('shows them to the reviewer and stores them', async ({ flow }) => {
      await withExtras(flow, 'confirm');

      expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
        pendingReview({ notes, screenshot }),
      ]);
      expect(flow.db.read(SIGNUP_PATH)).toEqual(
        storedSignup(flow, {
          notes,
          screenshot,
          reviewMessageId: latestReview(flow).id,
        }),
      );
    });

    it('shows the screenshot in the approval announcement', async ({
      flow,
    }) => {
      await withExtras(flow, 'confirm');
      await approve(flow, { progPoint: 'P6' });

      expect(flow.discord.channel(SIGNUP_CHANNEL).map(shown)).toEqual([
        approvalAnnouncement(flow, { screenshot }),
      ]);
    });
  });

  describe('when a pending signup is resubmitted', () => {
    it('replaces its review message and stays pending', async ({ flow }) => {
      await submitSignup(flow);
      const firstReview = latestReview(flow);

      await submitSignup(flow, 'confirm', { job: 'healer' });

      expect(firstReview.deleted).toBe(true);
      expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
        pendingReview({ job: 'healer' }),
      ]);
      expect(flow.db.read(SIGNUP_PATH)).toEqual(
        storedSignup(flow, {
          role: 'healer',
          reviewMessageId: latestReview(flow).id,
          reviewedBy: null,
        }),
      );
    });
  });

  describe('when a submitted signup is reviewed', () => {
    it.beforeEach(async ({ flow }) => {
      await submitSignup(flow);
    });

    describe('and the reviewer reacts to approve it', () => {
      it.beforeEach(async ({ flow }) => {
        await reactToReview(flow, SIGNUP_REVIEW_REACTIONS.APPROVED);
      });

      it('DMs the reviewer the signup to approve at a prog point, with approval disabled until one is chosen', async ({
        flow,
      }) => {
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          approvalPrompt([
            progPointMenu(),
            approvalButtons({ canApprove: false }),
          ]),
        ]);

        await cancelApprovalPrompt(flow);
      });

      it('tells the reviewer to react again, and takes back their reaction, when they do not decide in time', async ({
        flow,
      }) => {
        flow.discord.expireAll();
        await flow.settle();

        flow.expectReported(
          /^Sentry exception: Error: Approval decision collector ended before resolving: time/,
        );
        flow.expectReported(/^error: \{\n\s+err: ApprovalDecisionTimeoutError/);
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          approvalPrompt([]),
          {
            location: dmTo(REVIEWER.id),
            reactions: {},
            deleted: false,
            content: SIGNUP_MESSAGES.PROG_DM_TIMEOUT,
            embeds: [],
            components: [],
          },
        ]);
        // the review is back as it was, without the reviewer's reaction
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          pendingReview(),
        ]);
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, { reviewMessageId: latestReview(flow).id }),
        );
      });

      it('enables approval and keeps the chosen prog point selected once one is chosen', async ({
        flow,
      }) => {
        await chooseProgPoint(flow, 'P6');

        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          approvalPrompt([
            progPointMenu('P6'),
            approvalButtons({ canApprove: true }),
          ]),
        ]);

        await cancelApprovalPrompt(flow);
      });
    });

    describe('and the reviewer approves it', () => {
      it.beforeEach(({ flow }) => approve(flow, { progPoint: 'P6' }));

      it('marks it approved at the chosen prog point', ({ flow }) => {
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            status: SignupStatus.APPROVED,
            reviewMessageId: latestReview(flow).id,
            progPoint: 'P6',
            partyStatus: PartyStatus.ProgParty,
            reviewedBy: REVIEWER.username,
          }),
        );
      });

      it('gives the player the prog role and the prog point role', ({
        flow,
      }) => {
        expect(flow.discord.rolesOf(PLAYER.id)).toEqual([
          DMU_PROG_ROLE,
          DMU_P6_ROLE,
        ]);
      });

      it('writes the player into the prog party section of the spreadsheet', ({
        flow,
      }) => {
        expect(flow.sheets.writes()).toEqual([
          rowWritten(flow, PROG_PARTY, nextFreeRow(flow, PROG_PARTY), 'P6'),
        ]);
      });

      it('announces the approval in the signup channel', ({ flow }) => {
        expect(flow.discord.channel(SIGNUP_CHANNEL).map(shown)).toEqual([
          approvalAnnouncement(flow),
        ]);
      });

      it('marks the review message as approved by the reviewer', ({ flow }) => {
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          approvedReview(flow),
        ]);
      });

      it('confirms the decision to the reviewer and removes the prompt controls', ({
        flow,
      }) => {
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          approvalPrompt([]),
        ]);
        expect(flow.discord.repliesTo(REVIEWER.id).map(shown)).toEqual([
          textReply(
            REVIEWER.id,
            SIGNUP_MESSAGES.APPROVAL_CONFIRMATION_RECEIVED,
            { ephemeral: false },
          ),
        ]);
      });

      it('sends the player no direct message', ({ flow }) => {
        // the approval did run: it was announced
        expect(flow.discord.channel(SIGNUP_CHANNEL).map(shown)).toEqual([
          approvalAnnouncement(flow),
        ]);
        expect(flow.discord.dmsTo(PLAYER.id)).toEqual([]);
      });

      it('ignores a second reviewer reacting afterwards', async ({ flow }) => {
        flow.discord.addMember(OTHER_REVIEWER);

        await reactToReview(
          flow,
          SIGNUP_REVIEW_REACTIONS.APPROVED,
          OTHER_REVIEWER.id,
        );

        expect(flow.discord.dmsTo(OTHER_REVIEWER.id)).toEqual([]);
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            status: SignupStatus.APPROVED,
            reviewMessageId: latestReview(flow).id,
            progPoint: 'P6',
            partyStatus: PartyStatus.ProgParty,
            reviewedBy: REVIEWER.username,
          }),
        );
        // the review stays as approved; the bot leaves the late reaction be
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          approvedReview(flow, undefined, {
            approved: [REVIEWER.id, OTHER_REVIEWER.id],
          }),
        ]);
      });
    });

    describe('and the reviewer approves it with a comment', () => {
      it('asks the reviewer for the comment in a modal', async ({ flow }) => {
        await approve(flow, { progPoint: 'P6', comment: 'Great clear' });

        expect(flow.discord.modalsShownTo(REVIEWER.id)).toEqual([
          textModal(APPROVAL_COMMENT_MODAL_ID, 'Add a Comment for the User', {
            custom_id: APPROVAL_COMMENT_INPUT_ID,
            label: 'Comment',
            placeholder:
              'This will be sent to the user along with their approval...',
            required: false,
          }),
        ]);
      });

      it('keeps the prompt controls while the comment modal is open', async ({
        flow,
      }) => {
        await reactToReview(flow, SIGNUP_REVIEW_REACTIONS.APPROVED);
        await chooseProgPoint(flow, 'P6');
        await pressInApprovalPrompt(flow, APPROVE_WITH_COMMENT_BUTTON_ID);

        // the reviewer can close the modal and still decide
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          approvalPrompt([
            progPointMenu('P6'),
            approvalButtons({ canApprove: true }),
          ]),
        ]);

        // finish, so the prompt doesn't time out
        flow.discord.submitModal(REVIEWER.id, {
          [APPROVAL_COMMENT_INPUT_ID]: 'Great clear',
        });
        await flow.settle();
      });

      it('confirms the decision to the reviewer once the comment is in and removes the prompt controls', async ({
        flow,
      }) => {
        await approve(flow, { progPoint: 'P6', comment: 'Great clear' });

        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          approvalPrompt([]),
        ]);
        expect(flow.discord.repliesTo(REVIEWER.id).map(shown)).toEqual([
          textReply(
            REVIEWER.id,
            SIGNUP_MESSAGES.APPROVAL_CONFIRMATION_RECEIVED,
            { ephemeral: false },
          ),
        ]);
      });

      it('DMs the player the comment, quoting every line', async ({ flow }) => {
        await approve(flow, {
          progPoint: 'P6',
          comment: 'Great clear\nSee you in P7',
        });

        expect(flow.discord.dmsTo(PLAYER.id).map(shown)).toEqual([
          {
            location: dmTo(PLAYER.id),
            reactions: {},
            deleted: false,
            content: `Your signup for **${ENCOUNTER_NAME}** was approved. The reviewer left you a comment:\n\n> Great clear\n> See you in P7`,
            embeds: [],
            components: [],
          },
        ]);
      });

      it('does not store the comment', async ({ flow }) => {
        await approve(flow, { progPoint: 'P6', comment: 'Great clear' });

        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            status: SignupStatus.APPROVED,
            reviewMessageId: latestReview(flow).id,
            progPoint: 'P6',
            partyStatus: PartyStatus.ProgParty,
            reviewedBy: REVIEWER.username,
          }),
        );
      });

      it('reports the failed DM and still completes the approval when the player cannot be DMed', async ({
        flow,
      }) => {
        flow.discord.failDirectMessagesTo(PLAYER.id);

        await approve(flow, { progPoint: 'P6', comment: 'Great clear' });

        flow.expectReported(/^error: .*Cannot send messages to this user/);
        flow.expectReported(
          /^Sentry exception: .*Cannot send messages to this user/,
        );
        // everything an approval does still happens
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            status: SignupStatus.APPROVED,
            reviewMessageId: latestReview(flow).id,
            progPoint: 'P6',
            partyStatus: PartyStatus.ProgParty,
            reviewedBy: REVIEWER.username,
          }),
        );
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          approvedReview(flow),
        ]);
        expect(flow.discord.rolesOf(PLAYER.id)).toEqual([
          DMU_PROG_ROLE,
          DMU_P6_ROLE,
        ]);
        expect(flow.sheets.writes()).toEqual([
          rowWritten(flow, PROG_PARTY, nextFreeRow(flow, PROG_PARTY), 'P6'),
        ]);
        expect(flow.discord.channel(SIGNUP_CHANNEL).map(shown)).toEqual([
          approvalAnnouncement(flow),
        ]);
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          approvalPrompt([]),
        ]);
        expect(flow.discord.repliesTo(REVIEWER.id).map(shown)).toEqual([
          textReply(
            REVIEWER.id,
            SIGNUP_MESSAGES.APPROVAL_CONFIRMATION_RECEIVED,
            { ephemeral: false },
          ),
        ]);
      });
    });

    describe('and a prog-party player is later approved at a clear-party prog point', () => {
      it.beforeEach(async ({ flow }) => {
        await approve(flow, { progPoint: 'P6' });
        await submitSignup(flow, 'confirm', { 'prog-point': 'P7' });
        await approve(flow, { progPoint: 'P7' });
      });

      it('marks it approved at the clear party prog point', ({ flow }) => {
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            progPointRequested: 'P7',
            status: SignupStatus.APPROVED,
            reviewMessageId: latestReview(flow).id,
            progPoint: 'P7',
            partyStatus: PartyStatus.ClearParty,
            reviewedBy: REVIEWER.username,
          }),
        );
      });

      it('announces both approvals in the signup channel', ({ flow }) => {
        expect(flow.discord.channel(SIGNUP_CHANNEL).map(shown)).toEqual([
          approvalAnnouncement(flow),
          approvalAnnouncement(flow, { progPoint: 'P7' }),
        ]);
      });

      it('marks both review messages as approved by the reviewer', ({
        flow,
      }) => {
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          approvedReview(flow),
          approvedReview(flow, { progPoint: 'P7', previouslyApproved: 'P6' }),
        ]);
      });

      it('swaps the prog role for the clear role, and the prog point role for the new one', ({
        flow,
      }) => {
        expect(flow.discord.rolesOf(PLAYER.id)).toEqual([
          DMU_CLEAR_ROLE,
          DMU_P7_ROLE,
        ]);
      });

      it('moves them from the prog party to the clear party section of the spreadsheet', ({
        flow,
      }) => {
        const progRow = nextFreeRow(flow, PROG_PARTY);

        expect(flow.sheets.writes()).toEqual([
          rowWritten(flow, PROG_PARTY, progRow, 'P6'),
          rowCleared(flow, PROG_PARTY, progRow),
          rowWritten(flow, CLEAR_PARTY, nextFreeRow(flow, CLEAR_PARTY), 'P7'),
        ]);
      });
    });

    describe('and a prog-party player is later marked cleared', () => {
      it.beforeEach(async ({ flow }) => {
        await approve(flow, { progPoint: 'P6' });
        await submitSignup(flow, 'confirm', { 'prog-point': 'Cleared' });
        await approve(flow, { progPoint: PartyStatus.Cleared });
      });

      it('removes them from the spreadsheet', ({ flow }) => {
        const progRow = nextFreeRow(flow, PROG_PARTY);

        expect(flow.sheets.writes()).toEqual([
          rowWritten(flow, PROG_PARTY, progRow, 'P6'),
          rowCleared(flow, PROG_PARTY, progRow),
        ]);
      });

      it('removes the signup', ({ flow }) => {
        expect(flow.db.read(SIGNUP_PATH)).toBeUndefined();
      });

      it('marks both review messages as approved by the reviewer', ({
        flow,
      }) => {
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          approvedReview(flow),
          approvedReview(flow, {
            progPoint: 'Cleared',
            previouslyApproved: 'P6',
          }),
        ]);
      });

      it("removes the player's encounter roles", ({ flow }) => {
        expect(flow.discord.rolesOf(PLAYER.id)).toEqual([]);
      });

      it('congratulates the player in the signup channel', ({ flow }) => {
        expect(flow.discord.channel(SIGNUP_CHANNEL).map(shown)).toEqual([
          approvalAnnouncement(flow),
          approvalAnnouncement(flow, {
            progPoint: 'Cleared',
            title: 'Congratulations!',
            content: `<@${PLAYER.id}> Congratulations on clearing **${ENCOUNTER_NAME}**!`,
            // the bot celebrates a clear with its clear emojis
            reactions: Object.fromEntries(
              CLEAR_EMOJIS.map(({ id }) => [id, [BOT_USER_ID]]),
            ),
          }),
        ]);
      });

      it('reacts to the congratulation with the clear emojis', ({ flow }) => {
        const congratulation = flow.discord.channel(SIGNUP_CHANNEL).at(-1);
        if (!congratulation) throw new Error('No congratulation was posted');

        expect(reactionsOn(congratulation)).toEqual(
          Object.fromEntries(CLEAR_EMOJIS.map(({ id }) => [id, [BOT_USER_ID]])),
        );
      });
    });

    describe('and a clear-party player is later marked cleared', () => {
      it.beforeEach(async ({ flow }) => {
        await approve(flow, { progPoint: 'P7' });
        await submitSignup(flow, 'confirm', { 'prog-point': 'Cleared' });
        await approve(flow, { progPoint: PartyStatus.Cleared });
      });

      it("removes the player's clear role", ({ flow }) => {
        expect(flow.discord.rolesOf(PLAYER.id)).toEqual([]);
      });

      it('removes them from the clear party section of the spreadsheet', ({
        flow,
      }) => {
        const clearRow = nextFreeRow(flow, CLEAR_PARTY);

        expect(flow.sheets.writes()).toEqual([
          rowWritten(flow, CLEAR_PARTY, clearRow, 'P7'),
          rowCleared(flow, CLEAR_PARTY, clearRow),
        ]);
      });
    });

    describe('and the reviewer cancels the approval', () => {
      it.beforeEach(async ({ flow }) => {
        await reactToReview(flow, SIGNUP_REVIEW_REACTIONS.APPROVED);
        await cancelApprovalPrompt(flow);
      });

      it('leaves the signup and its review pending', ({ flow }) => {
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, { reviewMessageId: latestReview(flow).id }),
        );
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          pendingReview(),
        ]);
      });

      it("removes the reviewer's approve reaction so they can react again", ({
        flow,
      }) => {
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          pendingReview(),
        ]);
      });

      it('tells the reviewer the review was cancelled and removes the prompt controls', ({
        flow,
      }) => {
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          approvalPrompt([]),
        ]);
        expect(flow.discord.repliesTo(REVIEWER.id).map(shown)).toEqual([
          textReply(
            REVIEWER.id,
            SIGNUP_MESSAGES.APPROVAL_CANCELLATION_RECEIVED,
            { ephemeral: false },
          ),
        ]);
      });
    });

    describe('and the reviewer declines it with a reason', () => {
      it.beforeEach(({ flow }) => decline(flow, DECLINE_REASON));

      it('marks it declined with the reason', ({ flow }) => {
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            status: SignupStatus.DECLINED,
            reviewMessageId: latestReview(flow).id,
            reviewedBy: REVIEWER.username,
            declineReason: DECLINE_REASON,
          }),
        );
      });

      it('removes the reason menu once a reason is chosen, and privately confirms it', ({
        flow,
      }) => {
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          declineReasonPrompt({ withMenu: false }),
        ]);
        expect(flow.discord.repliesTo(REVIEWER.id).map(shown)).toEqual([
          textReply(
            REVIEWER.id,
            `✅ Decline reason recorded: "${DECLINE_REASON}"`,
            { ephemeral: true },
          ),
        ]);
      });

      it('DMs the player the reason', ({ flow }) => {
        expect(flow.discord.dmsTo(PLAYER.id).map(shown)).toEqual([
          declineDm(flow, declinedFor(DECLINE_REASON)),
        ]);
      });

      it('marks the review message as declined by the reviewer', ({ flow }) => {
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          declinedReview(flow),
        ]);
      });
    });

    describe('and the reviewer declines it as already cleared', () => {
      const reason = 'The encounter has already been cleared';

      it.beforeEach(({ flow }) => decline(flow, reason));

      it('DMs the player that they cannot sign up for it again', ({ flow }) => {
        expect(flow.discord.dmsTo(PLAYER.id).map(shown)).toEqual([
          declineDm(
            flow,
            declinedFor(
              reason,
              "Since you've already cleared this encounter, you won't be able to sign up for it again. Congratulations on your clear! 🎉",
            ),
          ),
        ]);
      });

      it('marks it and its review message declined with the reason', ({
        flow,
      }) => {
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            status: SignupStatus.DECLINED,
            reviewMessageId: latestReview(flow).id,
            reviewedBy: REVIEWER.username,
            declineReason: reason,
          }),
        );
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          declinedReview(flow),
        ]);
      });
    });

    describe('and the reviewer declines it with a custom reason', () => {
      const reason = 'Mechanics before P6 were not performed cleanly';

      it.beforeEach(async ({ flow }) => {
        await decline(flow, CUSTOM_DECLINE_REASON_VALUE);
        flow.discord.submitModal(REVIEWER.id, {
          [CUSTOM_DECLINE_REASON_INPUT_ID]: reason,
        });
        await flow.settle();
      });

      it('marks it declined with the custom reason', ({ flow }) => {
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            status: SignupStatus.DECLINED,
            reviewMessageId: latestReview(flow).id,
            reviewedBy: REVIEWER.username,
            declineReason: reason,
          }),
        );
      });

      it('asks the reviewer for the reason in a modal, removes the reason menu and privately confirms it', ({
        flow,
      }) => {
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          declineReasonPrompt({ withMenu: false }),
        ]);
        expect(flow.discord.modalsShownTo(REVIEWER.id)).toEqual([
          textModal(
            `${CUSTOM_DECLINE_REASON_MODAL_ID}-${PLAYER.id}-${Encounter.DMU}`,
            'Provide Custom Decline Reason',
            {
              custom_id: CUSTOM_DECLINE_REASON_INPUT_ID,
              label: 'Decline Reason',
              placeholder: 'Enter your reason for declining this signup...',
              required: true,
            },
          ),
        ]);
        expect(flow.discord.repliesTo(REVIEWER.id).map(shown)).toEqual([
          textReply(REVIEWER.id, `✅ Decline reason recorded: "${reason}"`, {
            ephemeral: true,
          }),
        ]);
      });

      it('DMs the player the custom reason', ({ flow }) => {
        expect(flow.discord.dmsTo(PLAYER.id).map(shown)).toEqual([
          declineDm(flow, declinedFor(reason)),
        ]);
      });
    });

    describe('and the reviewer reacts to decline it', () => {
      it('DMs the reviewer a menu of reasons to choose from', async ({
        flow,
      }) => {
        await reactToReview(flow, SIGNUP_REVIEW_REACTIONS.DECLINED);

        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          declineReasonPrompt({ withMenu: true }),
        ]);

        // answer, so the prompt doesn't time out
        flow.discord.choose(
          flow.discord.latestDmTo(REVIEWER.id),
          DECLINE_REASON,
          REVIEWER.id,
        );
        await flow.settle();
      });
    });

    describe('and the player resubmits before the declining reviewer picks a reason', () => {
      it.beforeEach(async ({ flow }) => {
        await reactToReview(flow, SIGNUP_REVIEW_REACTIONS.DECLINED);
        await submitSignup(flow);
        // the reviewer's prompt came before the resubmit
        flow.discord.choose(
          flow.discord.latestDmTo(REVIEWER.id),
          DECLINE_REASON,
          REVIEWER.id,
        );
        await flow.settle();
        flow.expectReported(
          /^warning: Decline reason not recorded for signup player-1-DMU, signup state changed/,
        );
      });

      it('tells the reviewer the reason was not recorded, and removes the reason menu', ({
        flow,
      }) => {
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          declineReasonPrompt({ withMenu: false }),
        ]);
        expect(flow.discord.repliesTo(REVIEWER.id).map(shown)).toEqual([
          textReply(REVIEWER.id, SIGNUP_MESSAGES.DECLINE_REASON_NOT_RECORDED, {
            ephemeral: false,
          }),
        ]);
      });

      it('keeps the resubmitted signup pending review, without a reason, and tells the player nothing', ({
        flow,
      }) => {
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            status: SignupStatus.UPDATE_PENDING,
            reviewMessageId: latestReview(flow).id,
            reviewedBy: null,
          }),
        );
        expect(flow.discord.dmsTo(PLAYER.id)).toEqual([]);
      });
    });

    describe('and the reviewer picks a custom reason but never submits it', () => {
      it.beforeEach(async ({ flow }) => {
        await decline(flow, CUSTOM_DECLINE_REASON_VALUE);
        flow.discord.expireAll();
        await flow.settle();
        flow.expectReported(
          /^warning: Custom decline reason modal timed out for signup player-1-DMU/,
        );
      });

      it('marks it declined without a reason and tells the player', ({
        flow,
      }) => {
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            status: SignupStatus.DECLINED,
            reviewMessageId: latestReview(flow).id,
            reviewedBy: REVIEWER.username,
          }),
        );
        expect(flow.discord.dmsTo(PLAYER.id).map(shown)).toEqual([
          declineDm(flow, SIGNUP_MESSAGES.SIGNUP_SUBMISSION_DENIED),
        ]);
      });

      it('marks the review message as declined by the reviewer', ({ flow }) => {
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          declinedReview(flow),
        ]);
      });

      it("removes the reason menu from the reviewer's prompt", ({ flow }) => {
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          declineReasonPrompt({ withMenu: false }),
        ]);
      });
    });

    describe('and the reviewer declines it but never picks a reason', () => {
      it.beforeEach(async ({ flow }) => {
        await reactToReview(flow, SIGNUP_REVIEW_REACTIONS.DECLINED);
        flow.discord.expireAll();
        await flow.settle();
        flow.expectReported(/^warning: Decline reason request timed out/);
      });

      it('marks it declined without a reason', ({ flow }) => {
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            status: SignupStatus.DECLINED,
            reviewMessageId: latestReview(flow).id,
            reviewedBy: REVIEWER.username,
          }),
        );
      });

      it('marks the review message as declined by the reviewer', ({ flow }) => {
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          declinedReview(flow),
        ]);
      });

      it("removes the reason menu from the reviewer's prompt", ({ flow }) => {
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          declineReasonPrompt({ withMenu: false }),
        ]);
      });

      it('still tells the player the signup was declined', ({ flow }) => {
        expect(flow.discord.dmsTo(PLAYER.id).map(shown)).toEqual([
          declineDm(flow, SIGNUP_MESSAGES.SIGNUP_SUBMISSION_DENIED),
        ]);
      });
    });

    describe('and someone without the reviewer role reacts', () => {
      it("ignores the reaction, while still handling the reviewer's", async ({
        flow,
      }) => {
        await reactToReview(flow, SIGNUP_REVIEW_REACTIONS.APPROVED, PLAYER.id);
        await reactToReview(flow, SIGNUP_REVIEW_REACTIONS.APPROVED);

        // the reviewer's reaction proves reactions are being handled at all
        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          approvalPrompt([
            progPointMenu(),
            approvalButtons({ canApprove: false }),
          ]),
        ]);
        expect(flow.discord.dmsTo(PLAYER.id)).toEqual([]);
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, { reviewMessageId: latestReview(flow).id }),
        );

        await cancelApprovalPrompt(flow);
        // the review is untouched, and the bot leaves the player's reaction be
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          pendingReview(undefined, { approved: [PLAYER.id] }),
        ]);
      });
    });

    describe('and the approved signup is resubmitted', () => {
      it.beforeEach(async ({ flow }) => {
        await approve(flow, { progPoint: 'P6' });
        await submitSignup(flow, 'confirm', { 'prog-point': 'P7' });
      });

      // Regression: a unit test once stubbed upsert() to return APPROVED (which
      // it never does), so this protection was "tested" but never ran.
      it('keeps the approved review message as a record of the decision', ({
        flow,
      }) => {
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          approvedReview(flow),
          pendingReview({ progPoint: 'P7', previouslyApproved: 'P6' }),
        ]);
      });

      it('moves it back to review as an update', ({ flow }) => {
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            progPointRequested: 'P7',
            status: SignupStatus.UPDATE_PENDING,
            reviewMessageId: latestReview(flow).id,
            progPoint: 'P6',
            partyStatus: PartyStatus.ProgParty,
            reviewedBy: null,
          }),
        );
      });

      it('tells a reviewer who reacts to the old review message that it has no signup, and takes back their reaction', async ({
        flow,
      }) => {
        flow.discord.addMember(OTHER_REVIEWER);
        const [oldReview] = flow.discord.channel(REVIEW_CHANNEL);
        if (!oldReview) throw new Error('expected the approved review message');

        flow.discord.react(
          oldReview,
          SIGNUP_REVIEW_REACTIONS.APPROVED,
          OTHER_REVIEWER.id,
        );
        await flow.settle();

        flow.expectReported(/^Sentry exception: Error: Document not found/);
        flow.expectReported(
          /^error: \{\n\s+err: DocumentNotFoundException \[Error\]: Document not found/,
        );
        expect(flow.discord.dmsTo(OTHER_REVIEWER.id).map(shown)).toEqual([
          {
            location: dmTo(OTHER_REVIEWER.id),
            reactions: {},
            deleted: false,
            content: SIGNUP_MESSAGES.SIGNUP_NOT_FOUND_FOR_REACTION,
            embeds: [],
            components: [],
          },
        ]);
        // both reviews as they were, without the late reaction
        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          approvedReview(flow),
          pendingReview({ progPoint: 'P7', previouslyApproved: 'P6' }),
        ]);
      });

      it('DMs the reviewer approving the update the signup with its previously approved prog point', async ({
        flow,
      }) => {
        await reactToReview(flow, SIGNUP_REVIEW_REACTIONS.APPROVED);

        expect(flow.discord.dmsTo(REVIEWER.id).map(shown)).toEqual([
          // the first approval's prompt, answered
          approvalPrompt([]),
          approvalPrompt(
            [progPointMenu(), approvalButtons({ canApprove: false })],
            { progPoint: 'P7', previouslyApproved: 'P6' },
          ),
        ]);

        await cancelApprovalPrompt(flow);
      });

      it('shows the reviewer the previously approved prog point', ({
        flow,
      }) => {
        expect(shown(latestReview(flow))).toEqual(
          pendingReview({ progPoint: 'P7', previouslyApproved: 'P6' }),
        );
      });

      it('rewrites their existing prog party row when the update is approved in the same section', async ({
        flow,
      }) => {
        await approve(flow, { progPoint: 'P6' });

        const row = nextFreeRow(flow, PROG_PARTY);
        expect(flow.sheets.writes()).toEqual([
          rowWritten(flow, PROG_PARTY, row, 'P6'),
          rowUpdated(flow, PROG_PARTY, row, 'P6'),
        ]);
      });
    });

    describe('and the declined signup is resubmitted', () => {
      it('keeps the declined review message as a record of the decision', async ({
        flow,
      }) => {
        await decline(flow, DECLINE_REASON);

        await submitSignup(flow);

        expect(flow.discord.channel(REVIEW_CHANNEL).map(shown)).toEqual([
          declinedReview(flow),
          pendingReview(),
        ]);
      });

      it('moves it back to review as an update', async ({ flow }) => {
        await decline(flow, DECLINE_REASON);

        await submitSignup(flow);

        // the earlier decline reason no longer applies, so it's cleared
        expect(flow.db.read(SIGNUP_PATH)).toEqual(
          storedSignup(flow, {
            status: SignupStatus.UPDATE_PENDING,
            reviewMessageId: latestReview(flow).id,
            reviewedBy: null,
          }),
        );
      });
    });
  });
});
