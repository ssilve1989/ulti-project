import { EventEmitter } from 'node:events';
import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  DiscordjsErrorCodes,
  DiscordjsTypeError,
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
  discordjsError,
  FakeMessage,
  type MessageLocation,
  type OutgoingPayload,
  unknownResource,
} from './fake-message.js';

const BOT_USER_ID = 'bot-user';

interface FakeMember {
  id: string;
  username: string;
  displayName: string;
  roles: Set<string>;
}

interface OpenModal {
  customId: string;
  message: FakeMessage;
}

interface ModalWaiter {
  filter?: (interaction: ModalSubmitInteraction) => boolean;
  resolve: (interaction: ModalSubmitInteraction) => void;
  reject: (error: Error) => void;
}

/** The DiscordjsTypeError discord.js throws for a missing required option. */
function missingOption(name: string): Error {
  return Reflect.construct(DiscordjsTypeError, [
    DiscordjsErrorCodes.CommandInteractionOptionNotFound,
    name,
  ]);
}

/** discord.js's per-interaction response state. */
interface Acknowledgement {
  deferred: boolean;
  replied: boolean;
}

const answered = ({ deferred, replied }: Acknowledgement) =>
  deferred || replied;

const alreadyReplied = () =>
  Promise.reject(discordjsError(DiscordjsErrorCodes.InteractionAlreadyReplied));

const notReplied = () =>
  Promise.reject(discordjsError(DiscordjsErrorCodes.InteractionNotReplied));

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

function assertInteractive(message: FakeMessage): void {
  if (message.deleted) {
    throw new Error(
      `Message ${message.id} was deleted; nobody can interact with it`,
    );
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
  /** channelId → the guild it belongs to */
  private readonly channels = new Map<string, string>();
  private readonly messages: FakeMessage[] = [];
  private readonly failingDms = new Set<string>();
  private readonly pressed: Array<{ customId: string; ack: Acknowledgement }> =
    [];
  /** userId → the modal shown to them, and what is awaiting its submit */
  private readonly openModals = new Map<string, OpenModal>();
  private readonly modalWaiters = new Map<string, ModalWaiter>();
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

  addChannel(guildId: string, channelId: string): void {
    this.channels.set(channelId, guildId);
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

  /** Custom ids of pressed components and submitted modals the bot never deferred, updated, replied to or answered with a modal. */
  unacknowledged(): string[] {
    return this.pressed
      .filter(({ ack }) => !answered(ack))
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
    const ack: Acknowledgement = { deferred: false, replied: false };
    let reply: FakeMessage | undefined;
    const show = (payload: OutgoingPayload) => {
      if (reply) {
        reply.apply(payload);
      } else {
        reply = this.createMessage({ kind: 'reply', userId }, payload);
      }
      ack.replied = true;
      return Promise.resolve(reply.toMessage<true>());
    };

    const interaction = mockOf<ChatInputCommandInteraction<'cached'>>({
      commandName,
      guildId,
      user: this.user(userId),
      options: {
        getString: (name: string, required = false) => {
          const value = options[name] ?? null;
          if (value === null && required) throw missingOption(name);
          return value;
        },
        getAttachment: (name: string, required = false) => {
          const value = attachments[name] ?? null;
          if (value === null && required) throw missingOption(name);
          return value;
        },
      },
      deferReply: () => {
        if (answered(ack)) return alreadyReplied();
        ack.deferred = true;
        return Promise.resolve();
      },
      reply: (payload: OutgoingPayload) =>
        answered(ack) ? alreadyReplied() : show(payload),
      editReply: (payload: OutgoingPayload) =>
        answered(ack) ? show(payload) : notReplied(),
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
    this.emitReaction(message, emoji, userId);
  }

  private emitReaction(message: FakeMessage, emoji: string, userId: string) {
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
    assertInteractive(message);
    const buttons = message.buttons();
    const button = buttons.find((candidate) => candidate.customId === customId);
    if (!button) {
      throw new Error(
        `Message ${message.id} has no component "${customId}" (has: ${buttons.map((b) => b.customId).join(', ')})`,
      );
    }
    if (button.disabled) {
      throw new Error(
        `Button "${customId}" on message ${message.id} is disabled`,
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
    assertInteractive(message);
    const [menu, ...others] = message.selectMenus();
    if (menu === undefined || others.length > 0) {
      throw new Error(
        `Message ${message.id} must have exactly one select menu to choose from`,
      );
    }
    if (menu.disabled) {
      throw new Error(
        `Select menu "${menu.customId}" on message ${message.id} is disabled`,
      );
    }
    if (!menu.values.includes(value)) {
      throw new Error(
        `Select menu "${menu.customId}" does not offer "${value}" (offers: ${menu.values.join(', ')})`,
      );
    }
    message.dispatch(
      mockOf<StringSelectMenuInteraction>({
        ...this.componentInteraction(message, userId, menu.customId),
        values: [value],
        isButton: () => false,
        isStringSelectMenu: () => true,
      }),
    );
  }

  submitModal(userId: string, fields: Record<string, string>): void {
    const modal = this.openModals.get(userId);
    const waiter = this.modalWaiters.get(userId);
    if (!modal || !waiter) {
      throw new Error(`No modal is open and awaited for ${userId}`);
    }

    const ack: Acknowledgement = { deferred: false, replied: false };
    this.pressed.push({ customId: modal.customId, ack });
    const submit = mockOf<ModalSubmitInteraction>({
      ...this.responses(modal.message, userId, ack),
      customId: modal.customId,
      user: this.user(userId),
      message: modal.message.toMessage(),
      fields: { getTextInputValue: (id: string) => fields[id] ?? '' },
      isFromMessage: () => true,
    });
    if (waiter.filter && !waiter.filter(submit)) {
      throw new Error(
        `No modal is open and awaited for ${userId} (its awaiter filtered this submit out)`,
      );
    }

    this.openModals.delete(userId);
    this.modalWaiters.delete(userId);
    waiter.resolve(submit);
  }

  /** Times out every prompt the bot is still waiting on. */
  expireAll(): void {
    for (const message of this.messages) message.expire();
    for (const waiter of this.modalWaiters.values()) {
      waiter.reject(collectorTimeoutError());
    }
    this.modalWaiters.clear();
    this.openModals.clear();
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
      : Promise.reject(unknownResource(10007, `/members/${userId}`));
  }

  userHasRole({
    userId,
    roleId,
  }: {
    guildId: string;
    userId: string;
    roleId: string;
  }): Promise<boolean> {
    const member = this.members.get(userId);
    return member
      ? Promise.resolve(member.roles.has(roleId))
      : Promise.reject(unknownResource(10007, `/members/${userId}`));
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
    if (this.channels.get(channelId) !== guildId) {
      return Promise.reject(
        unknownResource(10003, `/guilds/${guildId}/channels/${channelId}`),
      );
    }
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
    guildId: string,
    channelId: string,
    messageId: string,
  ): Promise<Message | undefined> {
    const path = `/channels/${channelId}/messages/${messageId}`;
    if (this.channels.get(channelId) !== guildId) {
      return Promise.reject(unknownResource(10003, path));
    }
    const message = this.messages.find(
      ({ id, location, deleted }) =>
        id === messageId &&
        location.kind === 'channel' &&
        location.channelId === channelId &&
        !deleted,
    );
    if (!message) return Promise.reject(unknownResource(10008, path));
    message.deleted = true;
    return Promise.resolve(message.toMessage());
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
      (reacted, emoji) => this.emitReaction(reacted, emoji, BOT_USER_ID),
    );
    this.messages.push(message);
    return message;
  }

  private dm(userId: string, payload: OutgoingPayload): FakeMessage {
    if (!this.members.has(userId)) {
      throw unknownResource(10013, `/users/${userId}`);
    }
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
      bot: userId === BOT_USER_ID,
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

  /**
   * deferUpdate/update/reply/followUp for an interaction on `message`,
   * enforcing discord.js's rule that an interaction is answered exactly once
   * before any follow-up.
   */
  private responses(
    message: FakeMessage,
    userId: string,
    ack: Acknowledgement,
  ) {
    const answer = (kind: keyof Acknowledgement, effect: () => void) => {
      if (answered(ack)) return alreadyReplied();
      ack[kind] = true;
      effect();
      return Promise.resolve();
    };
    const post = (payload: OutgoingPayload) => {
      this.createMessage({ kind: 'reply', userId }, payload);
    };

    return {
      deferUpdate: () => answer('deferred', () => undefined),
      update: (payload: OutgoingPayload) =>
        answer('replied', () => message.apply(payload)),
      reply: (payload: OutgoingPayload) =>
        answer('replied', () => post(payload)),
      followUp: (payload: OutgoingPayload) => {
        if (!answered(ack)) return notReplied();
        post(payload);
        return Promise.resolve();
      },
      /** showModal answers the interaction, like reply does */
      answer,
    };
  }

  private componentInteraction(
    message: FakeMessage,
    userId: string,
    customId: string,
  ) {
    const ack: Acknowledgement = { deferred: false, replied: false };
    this.pressed.push({ customId, ack });
    const { answer, ...responses } = this.responses(message, userId, ack);

    return {
      ...responses,
      customId,
      user: this.user(userId),
      message: message.toMessage(),
      showModal: (modal: ModalBuilder) =>
        answer('replied', () => {
          this.openModals.set(userId, {
            customId: modal.toJSON().custom_id,
            message,
          });
        }),
      awaitModalSubmit: ({
        filter,
      }: {
        filter?: (interaction: ModalSubmitInteraction) => boolean;
      } = {}) =>
        new Promise<ModalSubmitInteraction>((resolve, reject) => {
          this.modalWaiters.set(userId, { filter, resolve, reject });
        }),
    };
  }
}
