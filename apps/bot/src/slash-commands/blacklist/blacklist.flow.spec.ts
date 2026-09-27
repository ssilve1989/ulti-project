import { PermissionFlagsBits } from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { avatarUrl } from '../../test-utils/discord/discord-mock.js';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import { isoDateSince } from '../../test-utils/matchers.js';
import {
  commandErrorReply,
  expectCommandErrorReported,
  textReply,
} from '../../test-utils/replies.js';

const GUILD = 'guild-1';
const BLACKLIST_CHANNEL = 'blacklist-channel';
const OTHER_BLACKLIST_CHANNEL = 'other-blacklist-channel';

// Discord ids are snowflakes; the bot title-cases text around mentions of them
const ADMIN = Object.freeze({
  id: '100000000000000001',
  username: 'admin',
  displayName: 'Admin Nick',
  permissions: PermissionFlagsBits.Administrator,
});
const PLAYER = Object.freeze({
  id: '100000000000000002',
  username: 'player',
  displayName: 'Player Nick',
});
/** Someone Discord knows who has left the server. */
const FORMER_MEMBER = Object.freeze({
  id: '100000000000000003',
  username: 'former',
});

const entryPath = (discordId: string) =>
  `blacklist/${GUILD}/documents/${discordId}`;

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      const flow = await createFlowApp();
      flow.discord.addChannel(GUILD, BLACKLIST_CHANNEL);
      flow.discord.addChannel(GUILD, OTHER_BLACKLIST_CHANNEL);
      flow.discord.addMember(ADMIN);
      flow.discord.addMember(PLAYER);
      flow.discord.addUser(FORMER_MEMBER);
      flow.db.seed(`settings/${GUILD}`, {
        blacklistChannelIds: [BLACKLIST_CHANNEL, OTHER_BLACKLIST_CHANNEL],
      });
      return flow;
    },
    (flow) => flow.close(),
  ),
});

/** The admin runs `/blacklist <subcommand>` and the bot finishes handling it. */
async function blacklist(
  flow: FlowApp,
  subcommand: 'add' | 'remove' | 'display',
  options: Record<string, string | number> = {},
): Promise<void> {
  flow.discord.command({
    userId: ADMIN.id,
    guildId: GUILD,
    commandName: 'blacklist',
    subcommand,
    options,
  });
  await flow.settle();
}

const repliesToAdmin = (flow: FlowApp) =>
  flow.discord.repliesTo(ADMIN.id).map(shown);

const blacklistChannels = (flow: FlowApp) =>
  [BLACKLIST_CHANNEL, OTHER_BLACKLIST_CHANNEL].map((channelId) =>
    flow.discord.channel(channelId).map(shown),
  );

/** The notice posted in a blacklist channel when the admin changes the blacklist. */
const updateNotice = (
  flow: FlowApp,
  channelId: string,
  {
    change,
    fields,
  }: {
    change: 'added to' | 'removed from';
    fields: Array<{ name: string; value: string; inline: boolean }>;
  },
) => ({
  location: { kind: 'channel', guildId: GUILD, channelId },
  reactions: {},
  deleted: false,
  content: undefined,
  embeds: [
    {
      title: 'Blacklist Updated',
      description: `A user has been ${change} the Blacklist`,
      timestamp: isoDateSince(flow.startedAt),
      footer: {
        text: `Submitted by ${ADMIN.displayName}`,
        icon_url: avatarUrl(ADMIN.id),
      },
      fields,
    },
  ],
  components: [],
});

/** The same notice in each blacklist channel. */
const noticeInEachChannel = (
  flow: FlowApp,
  notice: Parameters<typeof updateNotice>[2],
) =>
  [BLACKLIST_CHANNEL, OTHER_BLACKLIST_CHANNEL].map((channelId) => [
    updateNotice(flow, channelId, notice),
  ]);

const field = (name: string, value: string) => ({ name, value, inline: true });

/** The blank field that keeps a row of three inline fields aligned. */
const EMPTY_FIELD = field('\u200b', '\u200b');

describe('Blacklist', () => {
  describe('when an admin blacklists a member', () => {
    it.beforeEach(({ flow }) =>
      blacklist(flow, 'add', { user: PLAYER.id, reason: 'Harassment' }),
    );

    it('stores them under their display name', ({ flow }) => {
      expect(flow.db.read(entryPath(PLAYER.id))).toEqual({
        discordId: PLAYER.id,
        characterName: 'player nick',
        reason: 'Harassment',
        lodestoneId: null,
      });
    });

    it('tells the admin, privately, they were added', ({ flow }) => {
      expect(repliesToAdmin(flow)).toEqual([
        textReply(ADMIN.id, 'Successfully added to blacklist!', {
          ephemeral: true,
        }),
      ]);
    });

    it('tells every blacklist channel who was added and why', ({ flow }) => {
      expect(blacklistChannels(flow)).toEqual(
        noticeInEachChannel(flow, {
          change: 'added to',
          fields: [
            field('User', `Player Nick (<@${PLAYER.id}>)`),
            field('Reason', 'Harassment'),
          ],
        }),
      );
    });
  });

  describe('when an admin blacklists a character and its Lodestone ID', () => {
    it.beforeEach(({ flow }) =>
      blacklist(flow, 'add', {
        user: PLAYER.id,
        reason: 'Harassment',
        character: 'Some Alt',
        'lodestone-id': 12345,
      }),
    );

    it('stores the character given instead of the display name', ({ flow }) => {
      expect(flow.db.read(entryPath(PLAYER.id))).toEqual({
        discordId: PLAYER.id,
        characterName: 'some alt',
        reason: 'Harassment',
        lodestoneId: 12345,
      });
    });

    it('names the character and its Lodestone ID in the notice', ({ flow }) => {
      expect(blacklistChannels(flow)).toEqual(
        noticeInEachChannel(flow, {
          change: 'added to',
          fields: [
            field('User', `Some Alt (<@${PLAYER.id}>)`),
            field('Lodestone ID', '12345'),
            field('Reason', 'Harassment'),
          ],
        }),
      );
    });
  });

  describe('when an admin blacklists someone who has left the server', () => {
    it('stores them with an unknown character name', async ({ flow }) => {
      await blacklist(flow, 'add', {
        user: FORMER_MEMBER.id,
        reason: 'Harassment',
      });

      expect(flow.db.read(entryPath(FORMER_MEMBER.id))).toEqual({
        discordId: FORMER_MEMBER.id,
        characterName: 'unknown character name',
        reason: 'Harassment',
        lodestoneId: null,
      });
    });
  });

  describe('when an admin blacklists someone already on it', () => {
    it('replaces their entry with the new one', async ({ flow }) => {
      flow.db.seed(entryPath(PLAYER.id), {
        discordId: PLAYER.id,
        characterName: 'some alt',
        reason: 'Harassment',
        lodestoneId: 12345,
      });

      await blacklist(flow, 'add', { user: PLAYER.id, reason: 'Spam' });

      expect(flow.db.read(entryPath(PLAYER.id))).toEqual({
        discordId: PLAYER.id,
        characterName: 'player nick',
        reason: 'Spam',
        lodestoneId: null,
      });
    });
  });

  describe('when no blacklist channel is configured', () => {
    it('still stores the entry and posts no notice', async ({ flow }) => {
      flow.db.seed(`settings/${GUILD}`, { blacklistChannelIds: [] });

      await blacklist(flow, 'add', { user: PLAYER.id, reason: 'Harassment' });

      expect([
        flow.db.read(entryPath(PLAYER.id)),
        blacklistChannels(flow),
      ]).toEqual([
        {
          discordId: PLAYER.id,
          characterName: 'player nick',
          reason: 'Harassment',
          lodestoneId: null,
        },
        [[], []],
      ]);
    });
  });

  describe('when a blacklist channel no longer exists', () => {
    it('reports it and still notifies the other channels', async ({ flow }) => {
      flow.db.seed(`settings/${GUILD}`, {
        blacklistChannelIds: ['deleted-channel', BLACKLIST_CHANNEL],
      });

      await blacklist(flow, 'add', { user: PLAYER.id, reason: 'Harassment' });

      flow.expectReported(
        /^error: DiscordAPIError\[10003\]: Unknown Channel.*failed to send blacklist message to channel deleted-channel/s,
      );
      expect(flow.discord.channel(BLACKLIST_CHANNEL).map(shown)).toEqual([
        updateNotice(flow, BLACKLIST_CHANNEL, {
          change: 'added to',
          fields: [
            field('User', `Player Nick (<@${PLAYER.id}>)`),
            field('Reason', 'Harassment'),
          ],
        }),
      ]);
    });
  });

  describe('when an admin removes a blacklisted member', () => {
    it.beforeEach(async ({ flow }) => {
      flow.db.seed(entryPath(PLAYER.id), {
        discordId: PLAYER.id,
        characterName: 'some alt',
        reason: 'Harassment',
        lodestoneId: 12345,
      });
      await blacklist(flow, 'remove', { user: PLAYER.id });
    });

    it('deletes their entry', ({ flow }) => {
      expect(flow.db.read(entryPath(PLAYER.id))).toBeUndefined();
    });

    it('tells the admin, privately, it worked', ({ flow }) => {
      expect(repliesToAdmin(flow)).toEqual([
        textReply(ADMIN.id, 'Success!', { ephemeral: true }),
      ]);
    });

    it('tells every blacklist channel who was removed', ({ flow }) => {
      expect(blacklistChannels(flow)).toEqual(
        noticeInEachChannel(flow, {
          change: 'removed from',
          fields: [
            field('User', `Some Alt (<@${PLAYER.id}>)`),
            field('Lodestone ID', '12345'),
          ],
        }),
      );
    });
  });

  describe('when an admin removes someone who is not blacklisted', () => {
    it('says it worked and posts no notice', async ({ flow }) => {
      await blacklist(flow, 'remove', { user: PLAYER.id });

      expect([repliesToAdmin(flow), blacklistChannels(flow)]).toEqual([
        [textReply(ADMIN.id, 'Success!', { ephemeral: true })],
        [[], []],
      ]);
    });
  });

  describe('when an admin displays the blacklist', () => {
    /** The private list of `count` entries, shown as `fields`. */
    const listReply = (count: number, fields: unknown[]) => ({
      location: { kind: 'reply', userId: ADMIN.id, ephemeral: true },
      reactions: {},
      deleted: false,
      content: undefined,
      embeds: [
        {
          title: 'Blacklist',
          description: `There are ${count} users on the blacklist.`,
          fields,
        },
      ],
      components: [],
    });

    it('lists every entry, naming each by character, else display name', async ({
      flow,
    }) => {
      flow.db.seed(entryPath(PLAYER.id), {
        discordId: PLAYER.id,
        characterName: null,
        reason: 'Harassment',
        lodestoneId: 12345,
      });
      flow.db.seed(entryPath(FORMER_MEMBER.id), {
        discordId: FORMER_MEMBER.id,
        characterName: 'some alt',
        reason: 'Spam',
        lodestoneId: null,
      });

      await blacklist(flow, 'display');

      expect(repliesToAdmin(flow)).toEqual([
        listReply(2, [
          field('Player', `Player Nick (<@${PLAYER.id}>)`),
          field('Reason', 'Harassment'),
          field('Lodestone ID', '12345'),
          field('Player', `Some Alt (<@${FORMER_MEMBER.id}>)`),
          field('Reason', 'Spam'),
          EMPTY_FIELD,
        ]),
      ]);
    });

    it('shows just the bracketed mention for an entry with no character whose user has left', async ({
      flow,
    }) => {
      flow.db.seed(entryPath(FORMER_MEMBER.id), {
        discordId: FORMER_MEMBER.id,
        characterName: null,
        reason: 'Spam',
        lodestoneId: null,
      });

      await blacklist(flow, 'display');

      expect(repliesToAdmin(flow)).toEqual([
        listReply(1, [
          field('Player', ` (<@${FORMER_MEMBER.id}>)`),
          field('Reason', 'Spam'),
          EMPTY_FIELD,
        ]),
      ]);
    });
  });

  describe.each([
    ['add', { user: PLAYER.id, reason: 'Harassment' }],
    ['remove', { user: PLAYER.id }],
    ['display', {}],
  ] as const)('%s, when Firestore cannot be reached', (subcommand, options) => {
    it('replies with a command error, privately', async ({ flow }) => {
      flow.db.goOffline();

      await blacklist(flow, subcommand, options);

      expectCommandErrorReported(flow, '14 UNAVAILABLE');
      expect(repliesToAdmin(flow)).toEqual([commandErrorReply(flow, ADMIN.id)]);
    });
  });
});
