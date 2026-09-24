import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
    discord.addChannel('c1');
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
});
