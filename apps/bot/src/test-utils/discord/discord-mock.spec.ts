import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  DiscordAPIError,
  DiscordjsError,
  DiscordjsErrorCodes,
  Events,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type User,
} from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiscordMock } from './discord-mock.js';

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

describe('DiscordMock', () => {
  let discord: DiscordMock;

  beforeEach(() => {
    discord = new DiscordMock();
    discord.addMember({ id: 'u1', username: 'one', roles: ['r1'] });
  });

  it('records direct messages', async () => {
    await discord.sendDirectMessage('u1', { content: 'hello' });

    expect(discord.dmsTo('u1').map((dm) => dm.content)).toEqual(['hello']);
  });

  it('rejects direct messages to a user whose DMs fail', async () => {
    discord.failDirectMessagesTo('u1');

    await expect(discord.sendDirectMessage('u1', 'hello')).rejects.toThrow(
      'Cannot send messages',
    );
  });

  it('resolves a pending awaitMessageComponent when the user clicks', async () => {
    const message = await discord.sendDirectMessage('u1', {
      components: [goButton()],
    });
    const pending = message.awaitMessageComponent({
      filter: (i) => i.user.id === 'u1',
    });

    discord.click(discord.latestDmTo('u1'), 'go', 'u1');

    await expect(pending).resolves.toMatchObject({ customId: 'go' });
  });

  it('delivers a chosen select value to a component collector', async () => {
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

  it('refuses to click a component the message does not have', async () => {
    await discord.sendDirectMessage('u1', { components: [goButton()] });

    expect(() => discord.click(discord.latestDmTo('u1'), 'stop', 'u1')).toThrow(
      'has no component "stop"',
    );
  });

  it('refuses an interaction nothing is waiting for', async () => {
    await discord.sendDirectMessage('u1', { components: [goButton()] });

    expect(() => discord.click(discord.latestDmTo('u1'), 'go', 'u1')).toThrow(
      'Nothing on message',
    );
  });

  it('lists pressed components the bot never acknowledged', async () => {
    const message = await discord.sendDirectMessage('u1', {
      components: [goButton()],
    });
    const pending = message.awaitMessageComponent();

    discord.click(discord.latestDmTo('u1'), 'go', 'u1');
    await pending;

    expect(discord.unacknowledged()).toEqual(['go']);
  });

  it('times out every pending prompt on expireAll', async () => {
    const message = await discord.sendDirectMessage('u1', {
      components: [goButton()],
    });
    const pending = message.awaitMessageComponent();
    const endReasons: string[] = [];
    message
      .createMessageComponentCollector()
      .on('end', (_collected, reason) => endReasons.push(reason));

    discord.expireAll();

    await expect(pending).rejects.toMatchObject({
      code: DiscordjsErrorCodes.InteractionCollectorError,
    });
    expect(endReasons).toEqual(['time']);
  });

  it('emits MessageReactionAdd on the client when a user reacts', async () => {
    discord.addChannel('g1', 'c1');
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
    expect(review.reactions.get('✅')?.has('u1')).toBe(true);
  });

  it('applies role changes made through a guild member', async () => {
    const member = await discord.getGuildMember({
      guildId: 'g1',
      memberId: 'u1',
    });

    await member?.roles.add('r2');
    await member?.roles.remove(['r1']);

    expect(discord.rolesOf('u1')).toEqual(['r2']);
  });

  it('hands a submitted modal to the interaction awaiting it', async () => {
    const message = await discord.sendDirectMessage('u1', {
      components: [goButton()],
    });
    const pending = message.awaitMessageComponent();
    discord.click(discord.latestDmTo('u1'), 'go', 'u1');
    const click = await pending;
    if (!click.isButton()) throw new Error('expected a button click');

    await click.showModal(
      new ModalBuilder()
        .setCustomId('comment')
        .setTitle('Comment')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('text')
              .setLabel('Text')
              .setStyle(TextInputStyle.Short),
          ),
        ),
    );
    const submitted = click.awaitModalSubmit({ time: 1_000 });
    discord.submitModal('u1', { text: 'nice' });

    await expect(submitted).resolves.toMatchObject({ customId: 'comment' });
    expect((await submitted).fields.getTextInputValue('text')).toBe('nice');
  });

  describe('channels', () => {
    beforeEach(() => {
      discord.addChannel('g1', 'c1');
    });

    it('rejects fetching a channel through the wrong guild, like discord.js', async () => {
      await expect(
        discord.getTextChannel({ guildId: 'g2', channelId: 'c1' }),
      ).rejects.toThrow('Unknown Channel');
    });

    it('deletes a message only through the channel it was posted in', async () => {
      const channel = await discord.getTextChannel({
        guildId: 'g1',
        channelId: 'c1',
      });
      const sent = await channel?.send('review me');
      if (!sent) throw new Error('expected a sent message');
      const [posted] = discord.channel('c1');

      discord.addChannel('g1', 'c2');
      await expect(discord.deleteMessage('g1', 'c2', sent.id)).rejects.toThrow(
        'Unknown Message',
      );
      expect(posted?.deleted).toBe(false);

      await discord.deleteMessage('g1', 'c1', sent.id);
      expect(posted?.deleted).toBe(true);
      await expect(discord.deleteMessage('g1', 'c1', sent.id)).rejects.toThrow(
        'Unknown Message',
      );
    });
  });

  it('times out prompts with the DiscordjsError discord.js raises', async () => {
    const message = await discord.sendDirectMessage('u1', {
      components: [goButton()],
    });
    const pending = message.awaitMessageComponent();

    discord.expireAll();

    await expect(pending).rejects.toBeInstanceOf(DiscordjsError);
  });

  describe('what a user can interact with', () => {
    it('refuses to click a disabled button', async () => {
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

    it('refuses to choose a value the menu does not offer', async () => {
      const message = await discord.sendDirectMessage('u1', {
        components: [pointSelect()],
      });
      void message.awaitMessageComponent().catch(() => undefined);

      expect(() =>
        discord.choose(discord.latestDmTo('u1'), 'P9', 'u1'),
      ).toThrow('does not offer "P9"');
    });

    it('refuses to interact with a deleted message', async () => {
      const message = await discord.sendDirectMessage('u1', {
        components: [goButton()],
      });
      void message.awaitMessageComponent().catch(() => undefined);
      await message.delete();

      expect(() => discord.click(discord.latestDmTo('u1'), 'go', 'u1')).toThrow(
        'deleted',
      );
    });
  });

  describe('acknowledging interactions', () => {
    const aCommand = () =>
      discord.command({ userId: 'u1', guildId: 'g1', commandName: 'test' });

    it('rejects replying to a command that was already deferred', async () => {
      const { interaction } = aCommand();
      await interaction.deferReply();

      await expect(interaction.reply('hi')).rejects.toMatchObject({
        code: DiscordjsErrorCodes.InteractionAlreadyReplied,
      });
    });

    it('rejects editing a reply that was never sent', async () => {
      const { interaction } = aCommand();

      await expect(interaction.editReply('hi')).rejects.toMatchObject({
        code: DiscordjsErrorCodes.InteractionNotReplied,
      });
    });

    it('rejects updating a component interaction that was already deferred', async () => {
      const message = await discord.sendDirectMessage('u1', {
        components: [goButton()],
      });
      const pending = message.awaitMessageComponent();
      discord.click(discord.latestDmTo('u1'), 'go', 'u1');
      const click = await pending;
      await click.deferUpdate();

      await expect(click.update({ components: [] })).rejects.toMatchObject({
        code: DiscordjsErrorCodes.InteractionAlreadyReplied,
      });
    });
  });

  describe('behaving like the real Discord API', () => {
    it('rejects a role check for someone who is not a member', async () => {
      await expect(
        discord.userHasRole({
          guildId: 'g1',
          userId: 'stranger',
          roleId: 'r1',
        }),
      ).rejects.toMatchObject({ code: 10007 });
    });

    it('rejects a display name lookup for someone who is not a member', async () => {
      await expect(
        discord.getDisplayName({ guildId: 'g1', userId: 'stranger' }),
      ).rejects.toBeInstanceOf(DiscordAPIError);
    });

    it('rejects a direct message to an unknown user', async () => {
      await expect(
        discord.sendDirectMessage('stranger', 'hi'),
      ).rejects.toMatchObject({ code: 10013 });
    });

    it("emits the bot's own reactions on the gateway, as Discord does", async () => {
      discord.addChannel('g1', 'c1');
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

      expect(reactors).toEqual([{ id: expect.any(String), bot: true }]);
    });

    it('rejects editing, reacting to or deleting a deleted message', async () => {
      const message = await discord.sendDirectMessage('u1', 'hi');
      await message.delete();

      await expect(message.edit('again')).rejects.toMatchObject({
        code: 10008,
      });
      await expect(message.react('✅')).rejects.toMatchObject({ code: 10008 });
      await expect(message.delete()).rejects.toMatchObject({ code: 10008 });
    });

    it('only delivers the component type an awaiter asked for', async () => {
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

    it('throws for a missing required command option, like discord.js', () => {
      const { interaction } = discord.command({
        userId: 'u1',
        guildId: 'g1',
        commandName: 'test',
        options: {},
      });

      expect(() => interaction.options.getString('encounter', true)).toThrow(
        'encounter',
      );
      expect(interaction.options.getString('notes')).toBeNull();
    });

    it("keeps each user's open modal separate", async () => {
      discord.addMember({ id: 'u2', username: 'two' });
      const openModalFor = async (userId: string, customId: string) => {
        const message = await discord.sendDirectMessage(userId, {
          components: [goButton()],
        });
        const pending = message.awaitMessageComponent();
        discord.click(discord.latestDmTo(userId), 'go', userId);
        const click = await pending;
        if (!click.isButton()) throw new Error('expected a button click');
        await click.showModal(
          new ModalBuilder()
            .setCustomId(customId)
            .setTitle('Comment')
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('text')
                  .setLabel('Text')
                  .setStyle(TextInputStyle.Short),
              ),
            ),
        );
        return click.awaitModalSubmit({ time: 1_000 });
      };

      const first = openModalFor('u1', 'first');
      const second = openModalFor('u2', 'second');
      await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      discord.submitModal('u1', { text: 'one' });
      discord.submitModal('u2', { text: 'two' });

      await expect(first).resolves.toMatchObject({ customId: 'first' });
      await expect(second).resolves.toMatchObject({ customId: 'second' });
    });

    it('does not deliver a modal submit the awaiter filters out', async () => {
      const message = await discord.sendDirectMessage('u1', {
        components: [goButton()],
      });
      const pending = message.awaitMessageComponent();
      discord.click(discord.latestDmTo('u1'), 'go', 'u1');
      const click = await pending;
      if (!click.isButton()) throw new Error('expected a button click');
      await click.showModal(
        new ModalBuilder()
          .setCustomId('comment')
          .setTitle('Comment')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('text')
                .setLabel('Text')
                .setStyle(TextInputStyle.Short),
            ),
          ),
      );
      void click
        .awaitModalSubmit({ time: 1_000, filter: () => false })
        .catch(() => undefined);

      expect(() => discord.submitModal('u1', { text: 'x' })).toThrow(
        'No modal is open and awaited',
      );
    });
  });
});
