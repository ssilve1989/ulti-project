import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ComponentType,
  DiscordjsErrorCodes,
  DiscordjsTypeError,
  Events,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { fresh } from '../fixtures.js';
import { BOT_USER_ID, DiscordMock } from './discord-mock.js';
import {
  cannotMessageUser,
  discordjsError,
  shown,
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

/** The fake Discord, and the app's real DiscordService over its client. */
interface Bot {
  discord: DiscordMock;
  service: DiscordService;
}

const it = base.extend<Bot>({
  discord: fresh(() => {
    const discord = new DiscordMock();
    discord.addChannel('g1', 'c1');
    discord.addRole('g1', { id: 'r1', name: 'One' });
    discord.addRole('g1', { id: 'r2', name: 'Two' });
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
      new SlashCommandBuilder()
        .setName('grant')
        .setDescription('An admin command with a subcommand')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
          subcommand
            .setName('role')
            .setDescription('Grant a role')
            .addUserOption((option) =>
              option
                .setName('player')
                .setDescription('Player')
                .setRequired(true),
            )
            .addRoleOption((option) =>
              option.setName('role').setDescription('Role').setRequired(true),
            )
            .addChannelOption((option) =>
              option
                .setName('log')
                .setDescription('Log channel')
                .addChannelTypes(ChannelType.GuildText),
            ),
        ),
    ]);
    return discord;
  }),
  service: ({ discord }, use) => use(new DiscordService(discord.client)),
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
  const clickGo = async ({ discord, service }: Bot, userId = 'u1') => {
    const message = await service.sendDirectMessage(userId, {
      components: [goButton()],
    });
    const pending = message.awaitMessageComponent();
    discord.click(discord.latestDmTo(userId), 'go', userId);
    return pending;
  };

  /** Posts `content` as the bot in channel c1 of g1; returns the sent message. */
  const postInC1 = async ({ service }: Bot, content: string) => {
    const channel = await service.getTextChannel({
      guildId: 'g1',
      channelId: 'c1',
    });
    return channel?.send(content);
  };

  /**
   * DMs u1 `components` with something awaiting a click on them, as a
   * prompt would, so the test can see whether a click gets through.
   */
  const dmAwaitingClick = async (
    { service }: Bot,
    components: ReadonlyArray<
      | ActionRowBuilder<ButtonBuilder>
      | ActionRowBuilder<StringSelectMenuBuilder>
      | ActionRowBuilder<ChannelSelectMenuBuilder>
    >,
  ) => {
    const message = await service.sendDirectMessage('u1', {
      components: [...components],
    });
    void message.awaitMessageComponent().catch(() => undefined);
    return message;
  };

  /** Clicks a go button and answers it with a one-input modal. */
  const openModal = async (
    bot: Bot,
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
    const click = await clickGo(bot, userId);
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

  it('records direct messages', async ({ discord, service }) => {
    await service.sendDirectMessage('u1', { content: 'hello' });

    expect(discord.dmsTo('u1').map(shown)).toEqual([
      {
        location: { kind: 'dm', userId: 'u1' },
        content: 'hello',
        embeds: [],
        components: [],
        reactions: {},
        deleted: false,
      },
    ]);
  });

  it('rejects direct messages to a user whose DMs fail, like the API', async ({
    discord,
    service,
  }) => {
    discord.failDirectMessagesTo('u1');

    await expect(service.sendDirectMessage('u1', 'hello')).rejects.toEqual(
      cannotMessageUser('dm-u1'),
    );
  });

  it('resolves a pending awaitMessageComponent when the user clicks', async ({
    discord,
    service,
  }) => {
    const message = await service.sendDirectMessage('u1', {
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
    service,
  }) => {
    const message = await service.sendDirectMessage('u1', {
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
    service,
  }) => {
    await service.sendDirectMessage('u1', { components: [goButton()] });

    expect(() => discord.click(discord.latestDmTo('u1'), 'stop', 'u1')).toThrow(
      'has no component "stop"',
    );
  });

  it('refuses an interaction nothing is waiting for', async ({
    discord,
    service,
  }) => {
    await service.sendDirectMessage('u1', { components: [goButton()] });

    expect(() => discord.click(discord.latestDmTo('u1'), 'go', 'u1')).toThrow(
      'Nothing on message',
    );
  });

  it('lists pressed components the bot never acknowledged', async ({
    discord,
    service,
  }) => {
    const message = await service.sendDirectMessage('u1', {
      components: [goButton()],
    });
    const pending = message.awaitMessageComponent();

    discord.click(discord.latestDmTo('u1'), 'go', 'u1');
    await pending;

    expect(discord.unacknowledged()).toEqual(['go']);
  });

  it('times out every pending prompt on expireAll with the error discord.js raises', async ({
    discord,
    service,
  }) => {
    const message = await service.sendDirectMessage('u1', {
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
    service,
  }) => {
    await postInC1({ discord, service }, 'review me');
    const seen: Array<{ emoji: string | null; userId: string }> = [];
    discord.client.on(Events.MessageReactionAdd, (reaction, user) =>
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
    service,
  }) => {
    discord.addMember({
      id: 'u3',
      username: 'three',
      globalName: 'Three Global',
      displayName: 'Three Nickname',
    });
    const member = await service.getGuildMember({
      guildId: 'g1',
      memberId: 'u3',
    });

    expect([member?.user.displayName, member?.displayName]).toEqual([
      'Three Global',
      'Three Nickname',
    ]);
    await expect(
      service.getDisplayName({ guildId: 'g1', userId: 'u3' }),
    ).resolves.toBe('Three Nickname');
  });

  it('names a user with no global name by their username', async ({
    service,
  }) => {
    const member = await service.getGuildMember({
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
    service,
  }) => {
    await postInC1({ discord, service }, 'review me');
    const [review] = discord.channel('c1');
    if (!review) throw new Error('expected a message in c1');
    discord.react(review, '✅', 'u1');

    expect(() => discord.react(review, '✅', 'u1')).toThrow(
      'u1 already reacted ✅',
    );
  });

  it('applies role changes made through a guild member', async ({
    discord,
    service,
  }) => {
    const member = await service.getGuildMember({
      guildId: 'g1',
      memberId: 'u1',
    });

    await member?.roles.add('r2');
    await member?.roles.remove(['r1']);

    expect(discord.rolesOf('u1')).toEqual(['r2']);
  });

  it("refuses a role change with a role the member's guild does not have, as the API does", async ({
    discord,
    service,
  }) => {
    const member = await service.getGuildMember({
      guildId: 'g1',
      memberId: 'u1',
    });

    await expect(member?.roles.add('r9')).rejects.toThrow(
      'Guild g1 has no role r9',
    );
    expect(discord.rolesOf('u1')).toEqual(['r1']);
  });

  it('removes a role from every member holding it', async ({
    discord,
    service,
  }) => {
    discord.addMember({ id: 'u3', username: 'three', roles: ['r1', 'r2'] });

    const removed = await service.removeRole('g1', 'r1');

    expect([removed, discord.rolesOf('u1'), discord.rolesOf('u3')]).toEqual([
      2,
      [],
      ['r2'],
    ]);
  });

  it('hands a submitted modal to the interaction awaiting it', async ({
    discord,
    service,
  }) => {
    const click = await openModal({ discord, service });
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
      service,
    }) => {
      discord.addChannel('g2', 'c2');

      await expect(
        service.getTextChannel({ guildId: 'g2', channelId: 'c1' }),
      ).rejects.toEqual(
        discordjsError(DiscordjsErrorCodes.GuildChannelUnowned),
      );
    });

    it('rejects fetching a channel that does not exist, or through a guild the bot is not in', async ({
      service,
    }) => {
      await expect(
        service.getTextChannel({ guildId: 'g1', channelId: 'missing' }),
      ).rejects.toEqual(
        unknownResource(RESTJSONErrorCodes.UnknownChannel, '/channels/missing'),
      );
      await expect(
        service.getTextChannel({ guildId: 'g9', channelId: 'c1' }),
      ).rejects.toEqual(
        unknownResource(RESTJSONErrorCodes.UnknownGuild, '/guilds/g9'),
      );
    });

    it('deletes a message only through the channel it was posted in', async ({
      discord,
      service,
    }) => {
      const sent = await postInC1({ discord, service }, 'review me');
      if (!sent) throw new Error('expected a sent message');
      const [posted] = discord.channel('c1');
      const unknownMessage = (channelId: string) =>
        unknownResource(
          RESTJSONErrorCodes.UnknownMessage,
          `/channels/${channelId}/messages/${sent.id}`,
        );

      discord.addChannel('g1', 'c2');
      await expect(service.deleteMessage('g1', 'c2', sent.id)).rejects.toEqual(
        unknownMessage('c2'),
      );
      expect(posted?.deleted).toBe(false);

      await service.deleteMessage('g1', 'c1', sent.id);
      expect(posted?.deleted).toBe(true);
      await expect(service.deleteMessage('g1', 'c1', sent.id)).rejects.toEqual(
        unknownMessage('c1'),
      );
    });

    it('refuses message options it does not model instead of dropping them', async ({
      discord,
      service,
    }) => {
      const channel = await service.getTextChannel({
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
    const channelSelect = () =>
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('channels')
          .addChannelTypes(ChannelType.GuildText)
          .setMinValues(0)
          .setMaxValues(2),
      );

    it('delivers the channels chosen in a channel select menu', async ({
      discord,
      service,
    }) => {
      discord.addChannel('g1', 'c2');
      const message = await service.sendDirectMessage('u1', {
        components: [channelSelect()],
      });
      const pending = message.awaitMessageComponent();

      discord.chooseChannels(discord.latestDmTo('u1'), ['c1', 'c2'], 'u1');

      const chosen = await pending;
      expect(chosen.isChannelSelectMenu() && chosen.values).toEqual([
        'c1',
        'c2',
      ]);
    });

    it('refuses to choose a channel that does not exist, or more channels than the menu takes', async ({
      discord,
      service,
    }) => {
      discord.addChannel('g1', 'c2');
      discord.addChannel('g1', 'c3');
      await dmAwaitingClick({ discord, service }, [channelSelect()]);

      expect(() =>
        discord.chooseChannels(discord.latestDmTo('u1'), ['missing'], 'u1'),
      ).toThrow(`can't offer missing`);
      expect(() =>
        discord.chooseChannels(
          discord.latestDmTo('u1'),
          ['c1', 'c2', 'c3'],
          'u1',
        ),
      ).toThrow('takes 0-2 values, not 3');
    });

    it('refuses to choose several values in a menu that takes one', async ({
      discord,
      service,
    }) => {
      await dmAwaitingClick({ discord, service }, [pointSelect()]);

      expect(() =>
        discord.choose(discord.latestDmTo('u1'), ['P6', 'P6'], 'u1'),
      ).toThrow('takes 1-1 values, not 2');
    });

    it('refuses to click a disabled button', async ({ discord, service }) => {
      await dmAwaitingClick({ discord, service }, [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('go')
            .setLabel('Go')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        ),
      ]);

      expect(() => discord.click(discord.latestDmTo('u1'), 'go', 'u1')).toThrow(
        'disabled',
      );
    });

    it('refuses to choose from a disabled select menu', async ({
      discord,
      service,
    }) => {
      await dmAwaitingClick({ discord, service }, [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('point')
            .addOptions({ label: 'P6', value: 'P6' })
            .setDisabled(true),
        ),
      ]);

      expect(() =>
        discord.choose(discord.latestDmTo('u1'), 'P6', 'u1'),
      ).toThrow('is disabled');
    });

    it('refuses to choose a value the menu does not offer', async ({
      discord,
      service,
    }) => {
      await dmAwaitingClick({ discord, service }, [pointSelect()]);

      expect(() =>
        discord.choose(discord.latestDmTo('u1'), 'P9', 'u1'),
      ).toThrow('does not offer "P9"');
    });

    it('refuses to interact with a deleted message', async ({
      discord,
      service,
    }) => {
      const message = await dmAwaitingClick({ discord, service }, [goButton()]);
      await message.delete();

      expect(() => discord.click(discord.latestDmTo('u1'), 'go', 'u1')).toThrow(
        'deleted',
      );
    });

    it("refuses someone else interacting with a user's DM", async ({
      discord,
      service,
    }) => {
      await dmAwaitingClick({ discord, service }, [goButton()]);

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

    it('edits the message a component is on through editReply, once the interaction is answered', async ({
      discord,
      service,
    }) => {
      const click = await clickGo({ discord, service });

      await expect(click.editReply('too early')).rejects.toEqual(
        discordjsError(DiscordjsErrorCodes.InteractionNotReplied),
      );
      await click.deferUpdate();
      await click.editReply({ content: 'done', components: [] });

      expect(shown(discord.latestDmTo('u1'))).toEqual({
        location: { kind: 'dm', userId: 'u1' },
        content: 'done',
        embeds: [],
        components: [],
        reactions: {},
        deleted: false,
      });
    });

    it('rejects updating a component interaction that was already deferred', async ({
      discord,
      service,
    }) => {
      const click = await clickGo({ discord, service });
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
      service,
    }) => {
      const click = await clickGo({ discord, service });

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

      expect(discord.repliesTo('u1').map(shown)).toEqual([
        {
          location: { kind: 'reply', userId: 'u1', ephemeral: false },
          content: 'first',
          embeds: [],
          components: [],
          reactions: {},
          deleted: false,
        },
        {
          location: { kind: 'reply', userId: 'u1', ephemeral: true },
          content: 'second',
          embeds: [],
          components: [],
          reactions: {},
          deleted: false,
        },
      ]);
    });

    it('refuses reply flags other than ephemeral instead of dropping them', async ({
      discord,
      service,
    }) => {
      const click = await clickGo({ discord, service });

      await expect(
        click.reply({ content: 'hi', flags: MessageFlags.SuppressEmbeds }),
      ).rejects.toThrow('only supports the Ephemeral message flag');
      expect(discord.repliesTo('u1')).toEqual([]);
      expect(discord.unacknowledged()).toEqual(['go']);
    });
  });

  describe('behaving like the real Discord API', () => {
    it('rejects a role check for someone who is not a member', async ({
      service,
    }) => {
      await expect(
        service.userHasRole({
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
      service,
    }) => {
      await expect(
        service.getDisplayName({ guildId: 'g9', userId: 'u1' }),
      ).rejects.toEqual(
        unknownResource(RESTJSONErrorCodes.UnknownGuild, '/guilds/g9'),
      );
    });

    it('finds no guild member for a non-member or a guild the bot is not in', async ({
      service,
    }) => {
      await expect(
        service.getGuildMember({ guildId: 'g1', memberId: 'stranger' }),
      ).resolves.toBeUndefined();
      await expect(
        service.getGuildMember({ guildId: 'g9', memberId: 'u1' }),
      ).resolves.toBeUndefined();
    });

    it('rejects a direct message to an unknown user', async ({ service }) => {
      await expect(service.sendDirectMessage('stranger', 'hi')).rejects.toEqual(
        unknownResource(RESTJSONErrorCodes.UnknownUser, '/users/stranger'),
      );
    });

    it("emits the bot's own reactions on the gateway, as Discord does", async ({
      discord,
      service,
    }) => {
      const reactors: Array<{ id: string; bot: boolean }> = [];
      discord.client.on(Events.MessageReactionAdd, (_reaction, user) =>
        reactors.push({ id: user.id, bot: user.bot }),
      );
      const sent = await postInC1({ discord, service }, 'review me');
      await sent?.react('✅');

      expect(reactors).toEqual([{ id: BOT_USER_ID, bot: true }]);
    });

    it('rejects editing, reacting to, removing a reaction from or deleting a deleted message', async ({
      discord,
      service,
    }) => {
      const message = await postInC1({ discord, service }, 'review me');
      if (!message) throw new Error('expected a message in c1');
      const [posted] = discord.channel('c1');
      if (!posted) throw new Error('expected a message in c1');
      discord.react(posted, '✅', 'u1');
      const reaction = message.reactions.cache.get('✅');
      await message.delete();
      const unknownMessage = unknownResource(
        RESTJSONErrorCodes.UnknownMessage,
        `/channels/messages/${message.id}`,
      );

      await expect(message.edit('again')).rejects.toEqual(unknownMessage);
      await expect(message.react('✅')).rejects.toEqual(unknownMessage);
      await expect(reaction?.users.remove('u1')).rejects.toEqual(
        unknownMessage,
      );
      await expect(message.delete()).rejects.toEqual(unknownMessage);
    });

    it('only delivers the component type an awaiter asked for', async ({
      discord,
      service,
    }) => {
      const message = await service.sendDirectMessage('u1', {
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
      service,
    }) => {
      const first = (
        await openModal(
          { discord, service },
          { userId: 'u1', customId: 'first' },
        )
      ).awaitModalSubmit({ time: 1_000, filter: (i) => i.user.id === 'u1' });
      const second = (
        await openModal(
          { discord, service },
          { userId: 'u2', customId: 'second' },
        )
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
      service,
    }) => {
      const click = await openModal({ discord, service });
      const earlier = click.awaitModalSubmit({ time: 1_000 });
      const later = click.awaitModalSubmit({ time: 1_000 });

      discord.submitModal('u1', { text: 'nice' });

      const [a, b] = await Promise.all([earlier, later]);
      expect([a.customId, b.customId]).toEqual(['comment', 'comment']);
    });

    it('times out every modal awaiter on expireAll, with the error discord.js raises', async ({
      discord,
      service,
    }) => {
      const click = await openModal({ discord, service });
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
      service,
    }) => {
      const click = await openModal({ discord, service });
      void click
        .awaitModalSubmit({ time: 1_000, filter: () => false })
        .catch(() => undefined);

      expect(() => discord.submitModal('u1', { text: 'x' })).toThrow(
        `Nothing is awaiting u1's submit`,
      );
    });

    it('refuses a modal submit the Discord client would not allow', async ({
      discord,
      service,
    }) => {
      const click = await openModal({ discord, service });
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
      service,
    }) => {
      const click = await openModal({ discord, service }, { minLength: 3 });
      void click.awaitModalSubmit({ time: 1_000 }).catch(() => undefined);

      expect(() => discord.submitModal('u1', { text: 'ab' })).toThrow(
        `won't submit "text"`,
      );
    });

    it('submits an unfilled optional input as empty and throws for an input the modal lacks', async ({
      discord,
      service,
    }) => {
      const click = await openModal({ discord, service }, { required: false });
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

  it('lists a modal submit the bot never acknowledged', async ({
    discord,
    service,
  }) => {
    const click = await openModal({ discord, service });
    const submitted = click.awaitModalSubmit({ time: 1_000 });
    discord.submitModal('u1', { text: 'nice' });
    await submitted;

    expect(discord.unacknowledged()).toEqual(['comment']);
  });

  it('records the replies and follow-ups a user receives on their interactions', async ({
    discord,
    service,
  }) => {
    const click = await clickGo({ discord, service });

    await click.reply('first');
    await click.followUp({ content: 'second', embeds: [{ title: 'T' }] });

    expect(discord.repliesTo('u1').map(shown)).toEqual([
      {
        location: { kind: 'reply', userId: 'u1', ephemeral: false },
        content: 'first',
        embeds: [],
        components: [],
        reactions: {},
        deleted: false,
      },
      {
        location: { kind: 'reply', userId: 'u1', ephemeral: false },
        content: 'second',
        embeds: [{ title: 'T' }],
        components: [],
        reactions: {},
        deleted: false,
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
    service,
  }) => {
    const click = await clickGo({ discord, service });

    await click.reply('everyone sees this');
    await click.followUp({ content: 'secret', flags: MessageFlags.Ephemeral });

    expect(discord.repliesTo('u1').map((reply) => reply.location)).toEqual([
      { kind: 'reply', userId: 'u1', ephemeral: false },
      { kind: 'reply', userId: 'u1', ephemeral: true },
    ]);
  });

  it('records the modals shown to a user', async ({ discord, service }) => {
    await openModal({ discord, service });

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
    const grant = (
      discord: DiscordMock,
      userId: string,
      options: Record<string, string>,
    ) =>
      discord.command({
        userId,
        guildId: 'g1',
        commandName: 'grant',
        subcommand: 'role',
        options,
      });

    it('only delivers a command with default member permissions from members who have them', ({
      discord,
    }) => {
      discord.addMember({
        id: 'admin',
        username: 'admin',
        permissions: PermissionFlagsBits.Administrator,
      });

      expect(() => grant(discord, 'u1', { player: 'u2', role: 'r1' })).toThrow(
        'u1 lacks the permissions /grant requires',
      );
      expect(() =>
        grant(discord, 'admin', { player: 'u2', role: 'r1' }),
      ).not.toThrow();
    });

    it('only delivers a command with subcommands with one of them picked', ({
      discord,
    }) => {
      discord.addMember({
        id: 'admin',
        username: 'admin',
        permissions: PermissionFlagsBits.Administrator,
      });

      expect(() =>
        discord.command({
          userId: 'admin',
          guildId: 'g1',
          commandName: 'grant',
          options: { player: 'u2', role: 'r1' },
        }),
      ).toThrow("Discord won't send /grant without one of its subcommands");
    });

    it("resolves user, role and channel options to the guild's, like discord.js", ({
      discord,
    }) => {
      discord.addMember({
        id: 'admin',
        username: 'admin',
        permissions: PermissionFlagsBits.Administrator,
      });

      const { options } = grant(discord, 'admin', {
        player: 'u2',
        role: 'r1',
        log: 'c1',
      }).interaction;

      expect({
        subcommand: options.getSubcommand(),
        player: options.getUser('player', true).username,
        member: options.getMember('player')?.displayName,
        role: options.getRole('role', true).name,
        log: options.getChannel('log')?.id,
      }).toEqual({
        subcommand: 'role',
        player: 'two',
        member: 'two',
        role: 'One',
        log: 'c1',
      });
    });

    it('only lets an option pick a user, role or channel the guild has', ({
      discord,
    }) => {
      discord.addMember({
        id: 'admin',
        username: 'admin',
        permissions: PermissionFlagsBits.Administrator,
      });
      discord.addChannel('g2', 'c2');

      expect(() =>
        grant(discord, 'admin', { player: 'stranger', role: 'r1' }),
      ).toThrow('there is no such User in the guild');
      expect(() =>
        grant(discord, 'admin', { player: 'u2', role: 'r9' }),
      ).toThrow('there is no such Role in the guild');
      expect(() =>
        grant(discord, 'admin', { player: 'u2', role: 'r1', log: 'c2' }),
      ).toThrow('there is no such Channel in the guild');
    });

    const run = (
      discord: DiscordMock,
      commandName: string,
      options: Record<string, string | null> = {},
    ) => discord.command({ userId: 'u1', guildId: 'g1', commandName, options });

    it('delivers a command to the bot as an InteractionCreate event', ({
      discord,
    }) => {
      const received: string[] = [];
      discord.client.on(Events.InteractionCreate, (interaction) => {
        if (interaction.isChatInputCommand()) {
          received.push(interaction.commandName);
        }
      });

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
        '"proof" option is an Attachment',
      );
    });
  });

  describe('emojis', () => {
    it('mentions an emoji the bot has, and gives nothing for one it lacks', ({
      discord,
      service,
    }) => {
      discord.addEmoji({ id: 'e1', name: 'cheer' });

      expect([
        service.getEmojiString('e1'),
        service.getEmojiString('e2'),
      ]).toEqual(['<:_:e1>', '']);
    });

    it('reports a custom emoji reaction by name and id, and caches it by id, like discord.js', async ({
      discord,
      service,
    }) => {
      discord.addEmoji({ id: '123456789012345678', name: 'cheer' });
      const seen: Array<{ id: string | null; name: string | null }> = [];
      discord.client.on(Events.MessageReactionAdd, (reaction) =>
        seen.push(reaction.emoji),
      );
      const sent = await postInC1({ discord, service }, 'congratulations');
      const [emoji] = service.getEmojis(['cheer']);

      await sent?.react(emoji ?? 'missing');

      const [posted] = discord.channel('c1');
      expect(seen).toEqual([{ id: '123456789012345678', name: 'cheer' }]);
      expect([...(posted?.reactions.keys() ?? [])]).toEqual([
        '123456789012345678',
      ]);
    });

    it('finds emojis by name in the order asked, skipping missing ones', ({
      discord,
      service,
    }) => {
      discord.addEmoji({ id: 'e1', name: 'cheer' });
      discord.addEmoji({ id: 'e2', name: 'hype' });

      expect(
        service
          .getEmojis(['hype', 'missing', 'cheer'])
          .map((emoji) => String(emoji)),
      ).toEqual(['<:hype:e2>', '<:cheer:e1>']);
    });
  });
});
