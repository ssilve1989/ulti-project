import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  DiscordjsErrorCodes,
  DiscordjsTypeError,
  Events,
  MessageFlags,
  ModalBuilder,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type User,
} from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { fresh } from '../fixtures.js';
import { BOT_USER_ID, DiscordMock } from './discord-mock.js';
import {
  cannotMessageUser,
  discordjsError,
  unknownResource,
} from './fake-message.js';

const goButton = () =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('go')
      .setLabel('Go')
      .setStyle(ButtonStyle.Primary),
  );

const pointSelect = () =>
  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('point')
      .addOptions({ label: 'P6', value: 'P6' }),
  );

const it = base.extend<{ discord: DiscordMock }>({
  discord: fresh(() => {
    const discord = new DiscordMock();
    discord.addChannel('g1', 'c1');
    discord.addMember({ id: 'u1', username: 'one', roles: ['r1'] });
    discord.addMember({ id: 'u2', username: 'two' });
    discord.registerCommands([
      new SlashCommandBuilder()
        .setName('test')
        .setDescription('A test command')
        .addStringOption((option) =>
          option
            .setName('encounter')
            .setDescription('Encounter')
            .addChoices({ name: 'DSR', value: 'DSR' }),
        )
        .addStringOption((option) =>
          option.setName('notes').setDescription('Notes').setMaxLength(5),
        ),
      new SlashCommandBuilder()
        .setName('strict')
        .setDescription('A command with a required option')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Name')
            .setRequired(true)
            .setMinLength(2),
        )
        .addAttachmentOption((option) =>
          option.setName('proof').setDescription('Proof'),
        ),
    ]);
    return discord;
  }),
});

/** What the app reads off a component interaction. */
const pressed = (interaction: {
  customId: string;
  user: { id: string };
  isButton(): boolean;
}) => ({
  customId: interaction.customId,
  userId: interaction.user.id,
  isButton: interaction.isButton(),
});

describe('DiscordMock', () => {
  /** DMs `userId` a go button, clicks it, and returns the click the bot received. */
  const clickGo = async (discord: DiscordMock, userId = 'u1') => {
    const message = await discord.sendDirectMessage(userId, {
      components: [goButton()],
    });
    const pending = message.awaitMessageComponent();
    discord.click(discord.latestDmTo(userId), 'go', userId);
    return pending;
  };

  /** Clicks a go button and answers it with a one-input modal. */
  const openModal = async (
    discord: DiscordMock,
    {
      userId = 'u1',
      customId = 'comment',
      required = true,
      minLength,
    }: {
      userId?: string;
      customId?: string;
      required?: boolean;
      minLength?: number;
    } = {},
  ) => {
    const click = await clickGo(discord, userId);
    if (!click.isButton()) throw new Error('expected a button click');
    const input = new TextInputBuilder()
      .setCustomId('text')
      .setLabel('Text')
      .setStyle(TextInputStyle.Short)
      .setRequired(required)
      .setMaxLength(10);
    await click.showModal(
      new ModalBuilder()
        .setCustomId(customId)
        .setTitle('Comment')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            minLength === undefined ? input : input.setMinLength(minLength),
          ),
        ),
    );
    return click;
  };

  it('records direct messages', async ({ discord }) => {
    await discord.sendDirectMessage('u1', { content: 'hello' });

    expect(
      discord.dmsTo('u1').map(({ location, content, embeds, components }) => ({
        location,
        content,
        embeds,
        components,
      })),
    ).toEqual([
      {
        location: { kind: 'dm', userId: 'u1' },
        content: 'hello',
        embeds: [],
        components: [],
      },
    ]);
  });

  it('rejects direct messages to a user whose DMs fail, like the API', async ({
    discord,
  }) => {
    discord.failDirectMessagesTo('u1');

    await expect(discord.sendDirectMessage('u1', 'hello')).rejects.toEqual(
      cannotMessageUser('dm-u1'),
    );
  });

  it('resolves a pending awaitMessageComponent when the user clicks', async ({
    discord,
  }) => {
    const message = await discord.sendDirectMessage('u1', {
      components: [goButton()],
    });
    const pending = message.awaitMessageComponent({
      filter: (i) => i.user.id === 'u1',
    });

    discord.click(discord.latestDmTo('u1'), 'go', 'u1');

    expect(pressed(await pending)).toEqual({
      customId: 'go',
      userId: 'u1',
      isButton: true,
    });
  });

  it('delivers a chosen select value to a component collector', async ({
    discord,
  }) => {
    const message = await discord.sendDirectMessage('u1', {
      components: [pointSelect()],
    });
    const collected: string[] = [];
    message
      .createMessageComponentCollector()
      .on('collect', (i) =>
        collected.push(...(i.isStringSelectMenu() ? i.values : [])),
      );

    discord.choose(discord.latestDmTo('u1'), 'P6', 'u1');

    expect(collected).toEqual(['P6']);
  });

  it('refuses to click a component the message does not have', async ({
    discord,
  }) => {
    await discord.sendDirectMessage('u1', { components: [goButton()] });

    expect(() => discord.click(discord.latestDmTo('u1'), 'stop', 'u1')).toThrow(
      'has no component "stop"',
    );
  });

  it('refuses an interaction nothing is waiting for', async ({ discord }) => {
    await discord.sendDirectMessage('u1', { components: [goButton()] });

    expect(() => discord.click(discord.latestDmTo('u1'), 'go', 'u1')).toThrow(
      'Nothing on message',
    );
  });

  it('lists pressed components the bot never acknowledged', async ({
    discord,
  }) => {
    const message = await discord.sendDirectMessage('u1', {
      components: [goButton()],
    });
    const pending = message.awaitMessageComponent();

    discord.click(discord.latestDmTo('u1'), 'go', 'u1');
    await pending;

    expect(discord.unacknowledged()).toEqual(['go']);
  });

  it('times out every pending prompt on expireAll with the error discord.js raises', async ({
    discord,
  }) => {
    const message = await discord.sendDirectMessage('u1', {
      components: [goButton()],
    });
    const pending = message.awaitMessageComponent();
    const endReasons: string[] = [];
    message
      .createMessageComponentCollector()
      .on('end', (_collected, reason) => endReasons.push(reason));

    discord.expireAll();

    await expect(pending).rejects.toEqual(
      discordjsError(DiscordjsErrorCodes.InteractionCollectorError, ['time']),
    );
    expect(endReasons).toEqual(['time']);
  });

  it('emits MessageReactionAdd on the client when a user reacts', async ({
    discord,
  }) => {
    const channel = await discord.getTextChannel({
      guildId: 'g1',
      channelId: 'c1',
    });
    await channel?.send('review me');
    const seen: Array<{ emoji: string | null; userId: string }> = [];
    discord.client.on(
      Events.MessageReactionAdd,
      (reaction: { emoji: { name: string | null } }, user: User) =>
        seen.push({ emoji: reaction.emoji.name, userId: user.id }),
    );

    const [review] = discord.channel('c1');
    if (!review) throw new Error('expected a message in c1');
    discord.react(review, '✅', 'u1');

    expect(seen).toEqual([{ emoji: '✅', userId: 'u1' }]);
    expect([...review.reactions]).toEqual([['✅', new Set(['u1'])]]);
  });

  it('names a user by their global name, and a member by their guild nickname, like discord.js', async ({
    discord,
  }) => {
    discord.addMember({
      id: 'u3',
      username: 'three',
      globalName: 'Three Global',
      displayName: 'Three Nickname',
    });
    const member = await discord.getGuildMember({
      guildId: 'g1',
      memberId: 'u3',
    });

    expect([member?.user.displayName, member?.displayName]).toEqual([
      'Three Global',
      'Three Nickname',
    ]);
    await expect(
      discord.getDisplayName({ guildId: 'g1', userId: 'u3' }),
    ).resolves.toBe('Three Nickname');
  });

  it('names a user with no global name by their username', async ({
    discord,
  }) => {
    const member = await discord.getGuildMember({
      guildId: 'g1',
      memberId: 'u1',
    });

    expect([member?.user.displayName, member?.displayName]).toEqual([
      'one',
      'one',
    ]);
  });

  it('refuses a reaction the user already added, which Discord would not report again', async ({
    discord,
  }) => {
    const channel = await discord.getTextChannel({
      guildId: 'g1',
      channelId: 'c1',
    });
    await channel?.send('review me');
    const [review] = discord.channel('c1');
    if (!review) throw new Error('expected a message in c1');
    discord.react(review, '✅', 'u1');

    expect(() => discord.react(review, '✅', 'u1')).toThrow(
      'u1 already reacted ✅',
    );
  });

  it('applies role changes made through a guild member', async ({
    discord,
  }) => {
    const member = await discord.getGuildMember({
      guildId: 'g1',
      memberId: 'u1',
    });

    await member?.roles.add('r2');
    await member?.roles.remove(['r1']);

    expect(discord.rolesOf('u1')).toEqual(['r2']);
  });

  it('hands a submitted modal to the interaction awaiting it', async ({
    discord,
  }) => {
    const click = await openModal(discord);
    const submitted = click.awaitModalSubmit({ time: 1_000 });
    discord.submitModal('u1', { text: 'nice' });

    const submit = await submitted;
    // everything the app reads off a modal submit
    expect({
      customId: submit.customId,
      userId: submit.user.id,
      text: submit.fields.getTextInputValue('text'),
      fromMessage: submit.isFromMessage(),
      messageId: submit.message?.id,
    }).toEqual({
      customId: 'comment',
      userId: 'u1',
      text: 'nice',
      fromMessage: true,
      messageId: discord.latestDmTo('u1').id,
    });
  });

  describe('channels', () => {
    it('rejects fetching a channel through another guild, like discord.js', async ({
      discord,
    }) => {
      discord.addChannel('g2', 'c2');

      await expect(
        discord.getTextChannel({ guildId: 'g2', channelId: 'c1' }),
      ).rejects.toEqual(
        discordjsError(DiscordjsErrorCodes.GuildChannelUnowned),
      );
    });

    it('rejects fetching a channel that does not exist, or through a guild the bot is not in', async ({
      discord,
    }) => {
      await expect(
        discord.getTextChannel({ guildId: 'g1', channelId: 'missing' }),
      ).rejects.toEqual(
        unknownResource(RESTJSONErrorCodes.UnknownChannel, '/channels/missing'),
      );
      await expect(
        discord.getTextChannel({ guildId: 'g9', channelId: 'c1' }),
      ).rejects.toEqual(
        unknownResource(RESTJSONErrorCodes.UnknownGuild, '/guilds/g9'),
      );
    });

    it('deletes a message only through the channel it was posted in', async ({
      discord,
    }) => {
      const channel = await discord.getTextChannel({
        guildId: 'g1',
        channelId: 'c1',
      });
      const sent = await channel?.send('review me');
      if (!sent) throw new Error('expected a sent message');
      const [posted] = discord.channel('c1');
      const unknownMessage = (channelId: string) =>
        unknownResource(
          RESTJSONErrorCodes.UnknownMessage,
          `/channels/${channelId}/messages/${sent.id}`,
        );

      discord.addChannel('g1', 'c2');
      await expect(discord.deleteMessage('g1', 'c2', sent.id)).rejects.toEqual(
        unknownMessage('c2'),
      );
      expect(posted?.deleted).toBe(false);

      await discord.deleteMessage('g1', 'c1', sent.id);
      expect(posted?.deleted).toBe(true);
      await expect(discord.deleteMessage('g1', 'c1', sent.id)).rejects.toEqual(
        unknownMessage('c1'),
      );
    });

    it('refuses message options it does not model instead of dropping them', async ({
      discord,
    }) => {
      const channel = await discord.getTextChannel({
        guildId: 'g1',
        channelId: 'c1',
      });

      await expect(
        channel?.send({ content: 'hi', allowedMentions: { parse: [] } }),
      ).rejects.toThrow('does not support message options: allowedMentions');
      expect(discord.channel('c1')).toEqual([]);
    });
  });

  describe('what a user can interact with', () => {
    it('refuses to click a disabled button', async ({ discord }) => {
      const message = await discord.sendDirectMessage('u1', {
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('go')
              .setLabel('Go')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
          ),
        ],
      });
      void message.awaitMessageComponent().catch(() => undefined);

      expect(() => discord.click(discord.latestDmTo('u1'), 'go', 'u1')).toThrow(
        'disabled',
      );
    });

    it('refuses to choose from a disabled select menu', async ({ discord }) => {
      const message = await discord.sendDirectMessage('u1', {
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('point')
              .addOptions({ label: 'P6', value: 'P6' })
              .setDisabled(true),
          ),
        ],
      });
      void message.awaitMessageComponent().catch(() => undefined);

      expect(() =>
        discord.choose(discord.latestDmTo('u1'), 'P6', 'u1'),
      ).toThrow('is disabled');
    });

    it('refuses to choose a value the menu does not offer', async ({
      discord,
    }) => {
      const message = await discord.sendDirectMessage('u1', {
        components: [pointSelect()],
      });
      void message.awaitMessageComponent().catch(() => undefined);

      expect(() =>
        discord.choose(discord.latestDmTo('u1'), 'P9', 'u1'),
      ).toThrow('does not offer "P9"');
    });

    it('refuses to interact with a deleted message', async ({ discord }) => {
      const message = await discord.sendDirectMessage('u1', {
        components: [goButton()],
      });
      void message.awaitMessageComponent().catch(() => undefined);
      await message.delete();

      expect(() => discord.click(discord.latestDmTo('u1'), 'go', 'u1')).toThrow(
        'deleted',
      );
    });

    it("refuses someone else interacting with a user's DM", async ({
      discord,
    }) => {
      const message = await discord.sendDirectMessage('u1', {
        components: [goButton()],
      });
      void message.awaitMessageComponent().catch(() => undefined);

      expect(() => discord.click(discord.latestDmTo('u1'), 'go', 'u2')).toThrow(
        "u2 can't see message",
      );
      expect(() => discord.react(discord.latestDmTo('u1'), '✅', 'u2')).toThrow(
        "u2 can't see message",
      );
    });

    it("refuses someone else interacting with a user's ephemeral reply", async ({
      discord,
    }) => {
      const { interaction, reply } = discord.command({
        userId: 'u1',
        guildId: 'g1',
        commandName: 'test',
      });
      const shown = await interaction.reply({
        components: [goButton()],
        flags: MessageFlags.Ephemeral,
      });
      void shown.awaitMessageComponent().catch(() => undefined);

      expect(() => discord.click(reply(), 'go', 'u2')).toThrow(
        "u2 can't see message",
      );
    });
  });

  describe('acknowledging interactions', () => {
    const aCommand = (discord: DiscordMock) =>
      discord.command({ userId: 'u1', guildId: 'g1', commandName: 'test' });

    it('rejects replying to a command that was already deferred', async ({
      discord,
    }) => {
      const { interaction } = aCommand(discord);
      await interaction.deferReply();

      await expect(interaction.reply('hi')).rejects.toEqual(
        discordjsError(DiscordjsErrorCodes.InteractionAlreadyReplied),
      );
    });

    it('rejects editing a reply that was never sent', async ({ discord }) => {
      const { interaction } = aCommand(discord);

      await expect(interaction.editReply('hi')).rejects.toEqual(
        discordjsError(DiscordjsErrorCodes.InteractionNotReplied),
      );
    });

    it('rejects updating a component interaction that was already deferred', async ({
      discord,
    }) => {
      const click = await clickGo(discord);
      await click.deferUpdate();

      await expect(click.update({ components: [] })).rejects.toEqual(
        discordjsError(DiscordjsErrorCodes.InteractionAlreadyReplied),
      );
    });

    it('reports whether a command was deferred or replied, like discord.js', async ({
      discord,
    }) => {
      const { interaction } = aCommand(discord);
      const flags = () => [interaction.deferred, interaction.replied];

      const before = flags();
      await interaction.deferReply();
      const deferred = flags();
      await interaction.editReply('done');

      expect([before, deferred, flags()]).toEqual([
        [false, false],
        [true, false],
        [true, true],
      ]);
    });

    it('reports whether a component interaction was answered', async ({
      discord,
    }) => {
      const click = await clickGo(discord);

      const before = [click.deferred, click.replied];
      await click.update({ components: [] });

      expect([before, [click.deferred, click.replied]]).toEqual([
        [false, false],
        [false, true],
      ]);
    });

    it('adds a command follow-up as a new reply, only once answered', async ({
      discord,
    }) => {
      const { interaction } = aCommand(discord);

      await expect(interaction.followUp('too early')).rejects.toEqual(
        discordjsError(DiscordjsErrorCodes.InteractionNotReplied),
      );
      await interaction.reply('first');
      await interaction.followUp({
        content: 'second',
        flags: MessageFlags.Ephemeral,
      });

      expect(
        discord
          .repliesTo('u1')
          .map(({ location, content }) => ({ location, content })),
      ).toEqual([
        {
          location: { kind: 'reply', userId: 'u1', ephemeral: false },
          content: 'first',
        },
        {
          location: { kind: 'reply', userId: 'u1', ephemeral: true },
          content: 'second',
        },
      ]);
    });

    it('refuses reply flags other than ephemeral instead of dropping them', async ({
      discord,
    }) => {
      const click = await clickGo(discord);

      await expect(
        click.reply({ content: 'hi', flags: MessageFlags.SuppressEmbeds }),
      ).rejects.toThrow('only supports the Ephemeral message flag');
      expect(discord.repliesTo('u1')).toEqual([]);
      expect(discord.unacknowledged()).toEqual(['go']);
    });
  });

  describe('behaving like the real Discord API', () => {
    it('rejects a role check for someone who is not a member', async ({
      discord,
    }) => {
      await expect(
        discord.userHasRole({
          guildId: 'g1',
          userId: 'stranger',
          roleId: 'r1',
        }),
      ).rejects.toEqual(
        unknownResource(
          RESTJSONErrorCodes.UnknownMember,
          '/guilds/g1/members/stranger',
        ),
      );
    });

    it('rejects a display name lookup in a guild the bot is not in', async ({
      discord,
    }) => {
      await expect(
        discord.getDisplayName({ guildId: 'g9', userId: 'u1' }),
      ).rejects.toEqual(
        unknownResource(RESTJSONErrorCodes.UnknownGuild, '/guilds/g9'),
      );
    });

    it('finds no guild member for a non-member or a guild the bot is not in', async ({
      discord,
    }) => {
      await expect(
        discord.getGuildMember({ guildId: 'g1', memberId: 'stranger' }),
      ).resolves.toBeUndefined();
      await expect(
        discord.getGuildMember({ guildId: 'g9', memberId: 'u1' }),
      ).resolves.toBeUndefined();
    });

    it('rejects a direct message to an unknown user', async ({ discord }) => {
      await expect(discord.sendDirectMessage('stranger', 'hi')).rejects.toEqual(
        unknownResource(RESTJSONErrorCodes.UnknownUser, '/users/stranger'),
      );
    });

    it("emits the bot's own reactions on the gateway, as Discord does", async ({
      discord,
    }) => {
      const reactors: Array<{ id: string; bot: boolean }> = [];
      discord.client.on(
        Events.MessageReactionAdd,
        (_reaction: unknown, user: User) =>
          reactors.push({ id: user.id, bot: user.bot }),
      );
      const channel = await discord.getTextChannel({
        guildId: 'g1',
        channelId: 'c1',
      });

      const sent = await channel?.send('review me');
      await sent?.react('✅');

      expect(reactors).toEqual([{ id: BOT_USER_ID, bot: true }]);
    });

    it('rejects editing, reacting to or deleting a deleted message', async ({
      discord,
    }) => {
      const message = await discord.sendDirectMessage('u1', 'hi');
      await message.delete();
      const unknownMessage = unknownResource(
        RESTJSONErrorCodes.UnknownMessage,
        `/channels/messages/${message.id}`,
      );

      await expect(message.edit('again')).rejects.toEqual(unknownMessage);
      await expect(message.react('✅')).rejects.toEqual(unknownMessage);
      await expect(message.delete()).rejects.toEqual(unknownMessage);
    });

    it('only delivers the component type an awaiter asked for', async ({
      discord,
    }) => {
      const message = await discord.sendDirectMessage('u1', {
        components: [goButton()],
      });
      void message
        .awaitMessageComponent({ componentType: ComponentType.StringSelect })
        .catch(() => undefined);

      expect(() => discord.click(discord.latestDmTo('u1'), 'go', 'u1')).toThrow(
        'Nothing on message',
      );
    });

    it('throws for a missing required command option, like discord.js', ({
      discord,
    }) => {
      const { interaction } = discord.command({
        userId: 'u1',
        guildId: 'g1',
        commandName: 'test',
        options: {},
      });

      expect(() => interaction.options.getString('encounter', true)).toThrow(
        discordjsError(
          DiscordjsErrorCodes.CommandInteractionOptionNotFound,
          ['encounter'],
          DiscordjsTypeError,
        ),
      );
      expect(interaction.options.getString('notes')).toBeNull();
    });

    it("delivers each user's submit to the awaiters whose filter accepts it", async ({
      discord,
    }) => {
      const first = (
        await openModal(discord, { userId: 'u1', customId: 'first' })
      ).awaitModalSubmit({ time: 1_000, filter: (i) => i.user.id === 'u1' });
      const second = (
        await openModal(discord, { userId: 'u2', customId: 'second' })
      ).awaitModalSubmit({ time: 1_000, filter: (i) => i.user.id === 'u2' });
      discord.submitModal('u1', { text: 'one' });
      discord.submitModal('u2', { text: 'two' });

      const [firstSubmit, secondSubmit] = await Promise.all([first, second]);
      expect(firstSubmit.customId).toBe('first');
      expect(firstSubmit.fields.getTextInputValue('text')).toBe('one');
      expect(secondSubmit.customId).toBe('second');
      expect(secondSubmit.fields.getTextInputValue('text')).toBe('two');
    });

    it('delivers a submit to every awaiter that accepts it, like discord.js collectors', async ({
      discord,
    }) => {
      const click = await openModal(discord);
      const earlier = click.awaitModalSubmit({ time: 1_000 });
      const later = click.awaitModalSubmit({ time: 1_000 });

      discord.submitModal('u1', { text: 'nice' });

      const [a, b] = await Promise.all([earlier, later]);
      expect([a.customId, b.customId]).toEqual(['comment', 'comment']);
    });

    it('times out every modal awaiter on expireAll, with the error discord.js raises', async ({
      discord,
    }) => {
      const click = await openModal(discord);
      const pending = [
        click.awaitModalSubmit({ time: 1_000 }),
        click.awaitModalSubmit({ time: 1_000 }),
      ];

      discord.expireAll();

      const timeout = discordjsError(
        DiscordjsErrorCodes.InteractionCollectorError,
        ['time'],
      );
      await expect(pending[0]).rejects.toEqual(timeout);
      await expect(pending[1]).rejects.toEqual(timeout);
    });

    it('does not deliver a modal submit the awaiter filters out', async ({
      discord,
    }) => {
      const click = await openModal(discord);
      void click
        .awaitModalSubmit({ time: 1_000, filter: () => false })
        .catch(() => undefined);

      expect(() => discord.submitModal('u1', { text: 'x' })).toThrow(
        `Nothing is awaiting u1's submit`,
      );
    });

    it('refuses a modal submit the Discord client would not allow', async ({
      discord,
    }) => {
      const click = await openModal(discord);
      void click.awaitModalSubmit({ time: 1_000 }).catch(() => undefined);

      expect(() => discord.submitModal('u1', { other: 'x' })).toThrow(
        'has no input "other"',
      );
      expect(() => discord.submitModal('u1', {})).toThrow(
        `won't submit "text"`,
      );
      expect(() =>
        discord.submitModal('u1', { text: 'more than ten' }),
      ).toThrow(`won't submit "text"`);
    });

    it('refuses a modal input shorter than its minimum length', async ({
      discord,
    }) => {
      const click = await openModal(discord, { minLength: 3 });
      void click.awaitModalSubmit({ time: 1_000 }).catch(() => undefined);

      expect(() => discord.submitModal('u1', { text: 'ab' })).toThrow(
        `won't submit "text"`,
      );
    });

    it('submits an unfilled optional input as empty and throws for an input the modal lacks', async ({
      discord,
    }) => {
      const click = await openModal(discord, { required: false });
      const submitted = click.awaitModalSubmit({ time: 1_000 });
      discord.submitModal('u1', {});

      const { fields } = await submitted;
      expect(fields.getTextInputValue('text')).toBe('');
      expect(() => fields.getTextInputValue('other')).toThrow(
        discordjsError(
          DiscordjsErrorCodes.ModalSubmitInteractionFieldNotFound,
          ['other'],
          DiscordjsTypeError,
        ),
      );
    });
  });

  it('lists a modal submit the bot never acknowledged', async ({ discord }) => {
    const click = await openModal(discord);
    const submitted = click.awaitModalSubmit({ time: 1_000 });
    discord.submitModal('u1', { text: 'nice' });
    await submitted;

    expect(discord.unacknowledged()).toEqual(['comment']);
  });

  it('records the replies and follow-ups a user receives on their interactions', async ({
    discord,
  }) => {
    const click = await clickGo(discord);

    await click.reply('first');
    await click.followUp({ content: 'second', embeds: [{ title: 'T' }] });

    expect(
      discord
        .repliesTo('u1')
        .map(({ location, content, embeds, components }) => ({
          location,
          content,
          embeds,
          components,
        })),
    ).toEqual([
      {
        location: { kind: 'reply', userId: 'u1', ephemeral: false },
        content: 'first',
        embeds: [],
        components: [],
      },
      {
        location: { kind: 'reply', userId: 'u1', ephemeral: false },
        content: 'second',
        embeds: [{ title: 'T' }],
        components: [],
      },
    ]);
  });

  it('keeps a reply ephemeral when the command was deferred ephemerally', async ({
    discord,
  }) => {
    const { interaction, reply } = discord.command({
      userId: 'u1',
      guildId: 'g1',
      commandName: 'test',
    });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply('only you can see this');

    expect(reply().location).toEqual({
      kind: 'reply',
      userId: 'u1',
      ephemeral: true,
    });
  });

  it('shows interaction replies publicly unless they are flagged ephemeral', async ({
    discord,
  }) => {
    const click = await clickGo(discord);

    await click.reply('everyone sees this');
    await click.followUp({ content: 'secret', flags: MessageFlags.Ephemeral });

    expect(discord.repliesTo('u1').map((reply) => reply.location)).toEqual([
      { kind: 'reply', userId: 'u1', ephemeral: false },
      { kind: 'reply', userId: 'u1', ephemeral: true },
    ]);
  });

  it('records the modals shown to a user', async ({ discord }) => {
    await openModal(discord);

    expect(discord.modalsShownTo('u1')).toEqual([
      {
        custom_id: 'comment',
        title: 'Comment',
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.TextInput,
                custom_id: 'text',
                label: 'Text',
                style: TextInputStyle.Short,
                required: true,
                max_length: 10,
              },
            ],
          },
        ],
      },
    ]);
  });

  describe('slash commands', () => {
    const run = (
      discord: DiscordMock,
      commandName: string,
      options: Record<string, string | null> = {},
    ) => discord.command({ userId: 'u1', guildId: 'g1', commandName, options });

    it('delivers a command to the bot as an InteractionCreate event', ({
      discord,
    }) => {
      const received: string[] = [];
      discord.client.on(
        Events.InteractionCreate,
        (interaction: { commandName: string }) =>
          received.push(interaction.commandName),
      );

      run(discord, 'test', { encounter: 'DSR' });

      expect(received).toEqual(['test']);
    });

    it('only delivers commands from members of a guild the bot is in', ({
      discord,
    }) => {
      expect(() =>
        discord.command({ userId: 'u1', guildId: 'g9', commandName: 'test' }),
      ).toThrow('The bot is not in guild g9');
      expect(() =>
        discord.command({
          userId: 'stranger',
          guildId: 'g1',
          commandName: 'test',
        }),
      ).toThrow('stranger is not a member');
    });

    it('only sends commands and options the bot registered, as Discord does', ({
      discord,
    }) => {
      expect(() => run(discord, 'missing')).toThrow(
        'No /missing command is registered',
      );
      expect(() => run(discord, 'test', { other: 'x' })).toThrow(
        '/test has no "other" option',
      );
      expect(() => run(discord, 'test', { encounter: 'TOP' })).toThrow(
        'only offers DSR',
      );
      expect(() => run(discord, 'test', { notes: 'too long' })).toThrow(
        'with 8 characters',
      );
      expect(() => run(discord, 'strict')).toThrow(
        'without its required "name" option',
      );
      expect(() => run(discord, 'strict', { name: 'a' })).toThrow(
        'with 1 characters',
      );
      expect(() => run(discord, 'strict', { name: 'ok', proof: 'x' })).toThrow(
        `"proof" option is a Attachment, not a String`,
      );
    });
  });

  describe('emojis', () => {
    it('mentions an emoji the bot has, and gives nothing for one it lacks', ({
      discord,
    }) => {
      discord.addEmoji({ id: 'e1', name: 'cheer' });

      expect([
        discord.getEmojiString('e1'),
        discord.getEmojiString('e2'),
      ]).toEqual(['<:_:e1>', '']);
    });

    it('reports a custom emoji reaction by name and id, and caches it by id, like discord.js', async ({
      discord,
    }) => {
      discord.addEmoji({ id: '123456789012345678', name: 'cheer' });
      const seen: Array<{ id: string | null; name: string | null }> = [];
      discord.client.on(
        Events.MessageReactionAdd,
        (reaction: { emoji: { id: string | null; name: string | null } }) =>
          seen.push(reaction.emoji),
      );
      const channel = await discord.getTextChannel({
        guildId: 'g1',
        channelId: 'c1',
      });
      const sent = await channel?.send('congratulations');
      const [emoji] = discord.getEmojis(['cheer']);

      await sent?.react(emoji ?? 'missing');

      const [posted] = discord.channel('c1');
      expect(seen).toEqual([{ id: '123456789012345678', name: 'cheer' }]);
      expect([...(posted?.reactions.keys() ?? [])]).toEqual([
        '123456789012345678',
      ]);
    });

    it('finds emojis by name in the order asked, skipping missing ones', ({
      discord,
    }) => {
      discord.addEmoji({ id: 'e1', name: 'cheer' });
      discord.addEmoji({ id: 'e2', name: 'hype' });

      expect(
        discord
          .getEmojis(['hype', 'missing', 'cheer'])
          .map((emoji) => String(emoji)),
      ).toEqual(['<:hype:e2>', '<:cheer:e1>']);
    });
  });
});
