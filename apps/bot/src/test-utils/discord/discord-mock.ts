import { EventEmitter } from 'node:events';
import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type DMChannel,
  Events,
  type GuildEmoji,
  type GuildMember,
  type Message,
  MessagePayload,
  type MessageReaction,
  type ModalBuilder,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type TextChannel,
  type User,
} from 'discord.js';
import type { DiscordService } from '../../discord/discord.service.js';
import { mockOf } from '../mock-factory.js';
import {
  collectorTimeoutError,
  FakeMessage,
  type MessageLocation,
  type OutgoingPayload,
} from './fake-message.js';

const BOT_USER_ID = 'bot-user';

interface FakeMember {
  id: string;
  username: string;
  displayName: string;
  roles: Set<string>;
}

interface OpenModal {
  userId: string;
  customId: string;
  message: FakeMessage;
}

interface ModalWaiter {
  userId: string;
  resolve: (interaction: ModalSubmitInteraction) => void;
  reject: (error: Error) => void;
}

type DiscordServiceSurface = Pick<
  DiscordService,
  | 'deleteMessage'
  | 'getDisplayName'
  | 'getEmojis'
  | 'getEmojiString'
  | 'getGuildMember'
  | 'getTextChannel'
  | 'sendDirectMessage'
  | 'userHasRole'
>;

function attempt<T>(action: () => T): Promise<T> {
  try {
    return Promise.resolve(action());
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * A small Discord world (members, channels, messages) standing in for
 * `DiscordService` and the discord.js client in flow specs. Tests set the world
 * up, drive the bot the way Discord would (commands, clicks, reactions), and
 * assert on what the bot sent.
 */
export class DiscordMock implements DiscordServiceSurface {
  /** Stands in for the discord.js Client; the app subscribes to gateway events on it. */
  readonly client = new EventEmitter();
  private readonly members = new Map<string, FakeMember>();
  private readonly channels = new Set<string>();
  private readonly messages: FakeMessage[] = [];
  private readonly failingDms = new Set<string>();
  private readonly pressed: Array<{ customId: string; acknowledged: boolean }> =
    [];
  private openModal: OpenModal | undefined;
  private modalWaiter: ModalWaiter | undefined;
  private nextId = 1;

  // --- world setup

  addMember({
    id,
    username,
    displayName = username,
    roles = [],
  }: {
    id: string;
    username: string;
    displayName?: string;
    roles?: string[];
  }): void {
    this.members.set(id, { id, username, displayName, roles: new Set(roles) });
  }

  addChannel(channelId: string): void {
    this.channels.add(channelId);
  }

  failDirectMessagesTo(userId: string): void {
    this.failingDms.add(userId);
  }

  // --- queries

  channel(channelId: string): FakeMessage[] {
    return this.messages.filter(
      (message) =>
        message.location.kind === 'channel' &&
        message.location.channelId === channelId &&
        !message.deleted,
    );
  }

  dmsTo(userId: string): FakeMessage[] {
    return this.messages.filter(
      (message) =>
        message.location.kind === 'dm' && message.location.userId === userId,
    );
  }

  latestDmTo(userId: string): FakeMessage {
    const dm = this.dmsTo(userId).at(-1);
    if (!dm) throw new Error(`No direct message was sent to ${userId}`);
    return dm;
  }

  rolesOf(userId: string): string[] {
    return [...(this.members.get(userId)?.roles ?? [])];
  }

  /** Custom ids of pressed components the bot never deferred, updated, replied to or answered with a modal. */
  unacknowledged(): string[] {
    return this.pressed
      .filter(({ acknowledged }) => !acknowledged)
      .map(({ customId }) => customId);
  }

  // --- driving the bot

  command({
    userId,
    guildId,
    commandName,
    options = {},
    attachments = {},
  }: {
    userId: string;
    guildId: string;
    commandName: string;
    options?: Record<string, string | null>;
    attachments?: Record<string, { url: string }>;
  }): {
    interaction: ChatInputCommandInteraction<'cached'>;
    reply: () => FakeMessage;
  } {
    let reply: FakeMessage | undefined;
    const respond = (payload: OutgoingPayload) => {
      if (reply) {
        reply.apply(payload);
      } else {
        reply = this.createMessage({ kind: 'reply', userId }, payload);
      }
      return Promise.resolve(reply.toMessage<true>());
    };

    const interaction = mockOf<ChatInputCommandInteraction<'cached'>>({
      commandName,
      guildId,
      user: this.user(userId),
      options: {
        getString: (name: string) => options[name] ?? null,
        getAttachment: (name: string) => attachments[name] ?? null,
      },
      deferReply: () => Promise.resolve(),
      reply: respond,
      editReply: respond,
      inCachedGuild: () => true,
      isChatInputCommand: () => true,
    });

    return {
      interaction,
      reply: () => {
        if (!reply) throw new Error(`/${commandName} has not replied yet`);
        return reply;
      },
    };
  }

  react(message: FakeMessage, emoji: string, userId: string): void {
    message.addReaction(emoji, userId);
    this.client.emit(
      Events.MessageReactionAdd,
      mockOf<MessageReaction>({
        partial: false,
        emoji: { name: emoji },
        message: message.toMessage<true>(),
      }),
      this.user(userId),
    );
  }

  click(message: FakeMessage, customId: string, userId: string): void {
    if (!message.componentIds().includes(customId)) {
      throw new Error(
        `Message ${message.id} has no component "${customId}" (has: ${message.componentIds().join(', ')})`,
      );
    }
    message.dispatch(
      mockOf<ButtonInteraction>({
        ...this.componentInteraction(message, userId, customId),
        isButton: () => true,
        isStringSelectMenu: () => false,
      }),
    );
  }

  /** Picks `value` in the message's only select menu. */
  choose(message: FakeMessage, value: string, userId: string): void {
    const [customId, ...others] = message.selectMenuIds();
    if (customId === undefined || others.length > 0) {
      throw new Error(
        `Message ${message.id} must have exactly one select menu to choose from`,
      );
    }
    message.dispatch(
      mockOf<StringSelectMenuInteraction>({
        ...this.componentInteraction(message, userId, customId),
        values: [value],
        isButton: () => false,
        isStringSelectMenu: () => true,
      }),
    );
  }

  submitModal(userId: string, fields: Record<string, string>): void {
    const modal = this.openModal;
    const waiter = this.modalWaiter;
    if (modal?.userId !== userId || waiter?.userId !== userId) {
      throw new Error(`No modal is open and awaited for ${userId}`);
    }
    this.openModal = undefined;
    this.modalWaiter = undefined;

    waiter.resolve(
      mockOf<ModalSubmitInteraction>({
        ...this.responses(modal.message, userId, { acknowledged: true }),
        customId: modal.customId,
        user: this.user(userId),
        message: modal.message.toMessage(),
        fields: { getTextInputValue: (id: string) => fields[id] ?? '' },
        isFromMessage: () => true,
      }),
    );
  }

  /** Times out every prompt the bot is still waiting on. */
  expireAll(): void {
    for (const message of this.messages) message.expire();
    this.modalWaiter?.reject(collectorTimeoutError());
    this.modalWaiter = undefined;
    this.openModal = undefined;
  }

  // --- DiscordService surface

  getGuildMember({
    memberId,
  }: {
    memberId: string;
    guildId: string;
  }): Promise<GuildMember | undefined> {
    const member = this.members.get(memberId);
    return Promise.resolve(member && this.guildMember(member));
  }

  getDisplayName({
    userId,
  }: {
    guildId: string;
    userId: string;
  }): Promise<string> {
    const member = this.members.get(userId);
    return member
      ? Promise.resolve(member.displayName)
      : Promise.reject(new Error(`Unknown member ${userId}`));
  }

  userHasRole({
    userId,
    roleId,
  }: {
    guildId: string;
    userId: string;
    roleId: string;
  }): Promise<boolean> {
    return Promise.resolve(
      this.members.get(userId)?.roles.has(roleId) ?? false,
    );
  }

  getEmojiString(): string {
    return '';
  }

  getEmojis(): GuildEmoji[] {
    return [];
  }

  getTextChannel({
    guildId,
    channelId,
  }: {
    guildId: string;
    channelId: string;
  }): Promise<TextChannel | null> {
    if (!this.channels.has(channelId)) return Promise.resolve(null);
    return Promise.resolve(
      mockOf<TextChannel>({
        id: channelId,
        guildId,
        send: (payload: OutgoingPayload) =>
          Promise.resolve(
            this.createMessage(
              { kind: 'channel', guildId, channelId },
              payload,
            ).toMessage<true>(),
          ),
      }),
    );
  }

  sendDirectMessage(
    userId: string,
    message: Parameters<DMChannel['send']>[0],
  ): Promise<Message<false>> {
    if (message instanceof MessagePayload) {
      return Promise.reject(
        new Error('DiscordMock does not support MessagePayload'),
      );
    }
    return attempt(() => this.dm(userId, message).toMessage<false>());
  }

  deleteMessage(
    _guildId: string,
    _channelId: string,
    messageId: string,
  ): Promise<Message | undefined> {
    const message = this.messages.find(({ id }) => id === messageId);
    if (message) message.deleted = true;
    return Promise.resolve(message?.toMessage());
  }

  // --- internals

  private createMessage(
    location: MessageLocation,
    payload: OutgoingPayload,
  ): FakeMessage {
    const message = new FakeMessage(
      `message-${this.nextId++}`,
      location,
      BOT_USER_ID,
      payload,
    );
    this.messages.push(message);
    return message;
  }

  private dm(userId: string, payload: OutgoingPayload): FakeMessage {
    if (this.failingDms.has(userId)) {
      throw new Error(`Cannot send messages to this user (${userId})`);
    }
    return this.createMessage({ kind: 'dm', userId }, payload);
  }

  private user(userId: string): User {
    const member = this.members.get(userId);
    return mockOf<User>({
      id: userId,
      username: member?.username ?? userId,
      displayName: member?.displayName ?? userId,
      bot: false,
      partial: false,
      displayAvatarURL: () => `https://cdn.example/avatars/${userId}.png`,
      send: (payload: OutgoingPayload) =>
        attempt(() => this.dm(userId, payload).toMessage<false>()),
    });
  }

  private guildMember(member: FakeMember): GuildMember {
    const change =
      (apply: (roleId: string) => void) =>
      (roles: string | readonly string[]) => {
        for (const roleId of [roles].flat()) apply(roleId);
        return Promise.resolve();
      };

    return mockOf<GuildMember>({
      id: member.id,
      displayName: member.displayName,
      user: this.user(member.id),
      displayAvatarURL: () => `https://cdn.example/avatars/${member.id}.png`,
      roles: {
        cache: { has: (roleId: string) => member.roles.has(roleId) },
        add: change((roleId) => member.roles.add(roleId)),
        remove: change((roleId) => member.roles.delete(roleId)),
      },
    });
  }

  /** update/reply/followUp for an interaction on `message`, tracking acknowledgement. */
  private responses(
    message: FakeMessage,
    userId: string,
    press: { acknowledged: boolean },
  ) {
    const acknowledge = <T>(result: T): T => {
      press.acknowledged = true;
      return result;
    };
    const respond = (payload: OutgoingPayload) =>
      acknowledge(
        Promise.resolve(
          this.createMessage({ kind: 'reply', userId }, payload).toMessage(),
        ),
      );

    return {
      deferUpdate: () => acknowledge(Promise.resolve()),
      update: (payload: OutgoingPayload) => {
        message.apply(payload);
        return acknowledge(Promise.resolve());
      },
      reply: respond,
      followUp: respond,
    };
  }

  private componentInteraction(
    message: FakeMessage,
    userId: string,
    customId: string,
  ) {
    const press = { customId, acknowledged: false };
    this.pressed.push(press);

    return {
      ...this.responses(message, userId, press),
      customId,
      user: this.user(userId),
      message: message.toMessage(),
      showModal: (modal: ModalBuilder) => {
        press.acknowledged = true;
        this.openModal = {
          userId,
          customId: modal.toJSON().custom_id,
          message,
        };
        return Promise.resolve();
      },
      awaitModalSubmit: () =>
        new Promise<ModalSubmitInteraction>((resolve, reject) => {
          this.modalWaiter = { userId, resolve, reject };
        }),
    };
  }
}
