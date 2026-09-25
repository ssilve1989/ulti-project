import { EventEmitter } from 'node:events';
import {
  type APIApplicationCommandOption,
  type APIModalInteractionResponseCallbackData,
  ApplicationCommandOptionType,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  ComponentType,
  DiscordjsErrorCodes,
  DiscordjsTypeError,
  type DMChannel,
  Events,
  type GuildEmoji,
  type GuildMember,
  type Message,
  MessageFlags,
  MessageFlagsBitField,
  type MessageFlagsResolvable,
  MessagePayload,
  type MessageReaction,
  type ModalBuilder,
  type ModalSubmitInteraction,
  RESTJSONErrorCodes,
  type StringSelectMenuInteraction,
  type TextChannel,
  type User,
} from 'discord.js';
import type { DiscordService } from '../../discord/discord.service.js';
import { mockOf } from '../mock-factory.js';
import {
  cannotMessageUser,
  collectorTimeoutError,
  discordjsError,
  FakeMessage,
  type MessageLocation,
  type OutgoingPayload,
  reactionKey,
  resolveEmoji,
  unknownResource,
} from './fake-message.js';

export const BOT_USER_ID = 'bot-user';

/** The avatar URL every fake user has. */
export const avatarUrl = (userId: string) =>
  `https://cdn.example/avatars/${userId}.png`;

interface FakeMember {
  id: string;
  username: string;
  /** the user's Discord-wide display name, if they set one */
  globalName: string | null;
  /** the member's name in the guild (their nickname, else their global name) */
  displayName: string;
  roles: Set<string>;
}

interface OpenModal {
  modal: APIModalInteractionResponseCallbackData;
  message: FakeMessage;
}

interface TextInput {
  customId: string;
  required: boolean;
  minLength: number;
  maxLength: number;
}

/** The text inputs of a modal, with the limits the Discord client enforces. */
function textInputsOf(
  modal: APIModalInteractionResponseCallbackData,
): TextInput[] {
  return modal.components.flatMap((row) =>
    'components' in row
      ? row.components.flatMap((component) =>
          component.type === ComponentType.TextInput
            ? [
                {
                  customId: component.custom_id,
                  // Discord treats an input without `required` as required
                  required: component.required ?? true,
                  minLength: component.min_length ?? 0,
                  maxLength: component.max_length ?? 4000,
                },
              ]
            : [],
        )
      : [],
  );
}

interface ModalWaiter {
  filter?: (interaction: ModalSubmitInteraction) => boolean;
  resolve: (interaction: ModalSubmitInteraction) => void;
  reject: (error: Error) => void;
}

/** The DiscordjsTypeError discord.js throws for a missing required option. */
const missingOption = (name: string) =>
  discordjsError(
    DiscordjsErrorCodes.CommandInteractionOptionNotFound,
    [name],
    DiscordjsTypeError,
  );

/** A command as registered with Discord (what a slash command builder's toJSON() gives). */
interface RegisteredCommand {
  name: string;
  options?: readonly APIApplicationCommandOption[];
}

interface GivenOption {
  type: ApplicationCommandOptionType;
  value: string;
}

/** Throws unless `option` accepts `given`: the right type, within its choices and length limits. */
function assertAccepts(
  commandName: string,
  option: APIApplicationCommandOption,
  { type, value }: GivenOption,
): void {
  const label = `/${commandName}'s "${option.name}" option`;
  if (option.type !== type) {
    throw new Error(
      `${label} is a ${ApplicationCommandOptionType[option.type]}, not a ${ApplicationCommandOptionType[type]}`,
    );
  }
  if (option.type !== ApplicationCommandOptionType.String) return;
  const { choices } = option;
  if (choices && !choices.some((choice) => choice.value === value)) {
    throw new Error(
      `${label} only offers ${choices.map((choice) => choice.value).join(', ')} (got "${value}")`,
    );
  }
  if (
    value.length < (option.min_length ?? 0) ||
    value.length > (option.max_length ?? 6000)
  ) {
    throw new Error(
      `Discord won't send ${label} with ${value.length} characters`,
    );
  }
}

/**
 * Throws unless the Discord client would send /name with these options: every
 * option declared and acceptable, and every required option given.
 */
function assertSendable(
  command: RegisteredCommand,
  given: ReadonlyMap<string, GivenOption>,
): void {
  const declared = new Map(
    (command.options ?? []).map((option) => [option.name, option]),
  );
  for (const [name, value] of given) {
    const option = declared.get(name);
    if (!option) {
      throw new Error(`/${command.name} has no "${name}" option`);
    }
    assertAccepts(command.name, option, value);
  }
  for (const option of declared.values()) {
    if ('required' in option && option.required && !given.has(option.name)) {
      throw new Error(
        `Discord won't send /${command.name} without its required "${option.name}" option`,
      );
    }
  }
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

const isEphemeral = (flags: MessageFlagsResolvable | undefined) =>
  flags !== undefined &&
  new MessageFlagsBitField(flags).has(MessageFlags.Ephemeral);

/** What the bot sends in answer to an interaction, which may be ephemeral. */
type ReplyPayload =
  | string
  | (Exclude<OutgoingPayload, string> & { flags?: MessageFlagsResolvable });

/**
 * Splits a reply into whether it's ephemeral and the message itself. Ephemeral
 * is the only flag the fake models, so any other flag is refused.
 */
function splitReply(payload: ReplyPayload): {
  ephemeral: boolean;
  message: OutgoingPayload;
} {
  if (typeof payload === 'string')
    return { ephemeral: false, message: payload };
  const { flags, ...message } = payload;
  if (
    flags !== undefined &&
    new MessageFlagsBitField(flags).remove(MessageFlags.Ephemeral).bitfield !==
      0
  ) {
    throw new Error(
      `DiscordMock only supports the Ephemeral message flag (got ${new MessageFlagsBitField(flags).toArray().join(', ')})`,
    );
  }
  return { ephemeral: isEphemeral(flags), message };
}

/**
 * Gives a fake interaction discord.js's live `deferred` and `replied` flags,
 * which app code reads to decide how to answer (e.g. `safeReply`).
 */
function withAckFlags<T extends object>(
  interaction: T,
  ack: Acknowledgement,
): T {
  Object.defineProperties(interaction, {
    deferred: { enumerable: true, get: () => ack.deferred },
    replied: { enumerable: true, get: () => ack.replied },
  });
  return interaction;
}

/** Answers an interaction once, as discord.js allows; a second answer rejects. */
function answer(
  ack: Acknowledgement,
  kind: keyof Acknowledgement,
  effect: () => void,
): Promise<void> {
  if (answered(ack)) return alreadyReplied();
  return Promise.try(() => {
    effect();
    ack[kind] = true;
  });
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

/** Throws unless `userId` can see `message` and it still exists, as Discord requires to use it. */
function assertInteractive(message: FakeMessage, userId: string): void {
  if (message.deleted) {
    throw new Error(
      `Message ${message.id} was deleted; nobody can interact with it`,
    );
  }
  const { location } = message;
  const privateTo =
    location.kind === 'dm' || (location.kind === 'reply' && location.ephemeral)
      ? location.userId
      : undefined;
  if (privateTo !== undefined && privateTo !== userId) {
    throw new Error(
      `${userId} can't see message ${message.id}; only ${privateTo} can`,
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
  private readonly commands = new Map<string, RegisteredCommand>();
  /** The bot's emoji cache: id → name */
  private readonly emojis = new Map<string, string>();
  private readonly guilds = new Set<string>();
  /** channelId → the guild it belongs to */
  private readonly channels = new Map<string, string>();
  private readonly messages: FakeMessage[] = [];
  private readonly failingDms = new Set<string>();
  private readonly pressed: Array<{ customId: string; ack: Acknowledgement }> =
    [];
  /** userId → the modal shown to them, and what is awaiting its submit */
  private readonly openModals = new Map<string, OpenModal>();
  /**
   * Everything awaiting a modal submit. Like discord.js's collectors these are
   * client-wide: each gets every submit its filter accepts.
   */
  private modalWaiters: ModalWaiter[] = [];
  private readonly shownModals: Array<{
    userId: string;
    modal: APIModalInteractionResponseCallbackData;
  }> = [];
  private nextId = 1;

  // --- world setup

  addMember({
    id,
    username,
    globalName = null,
    displayName = globalName ?? username,
    roles = [],
  }: {
    id: string;
    username: string;
    globalName?: string | null;
    /** the guild display name (a nickname); defaults to the global name */
    displayName?: string;
    roles?: readonly string[];
  }): void {
    this.members.set(id, {
      id,
      username,
      globalName,
      displayName,
      roles: new Set(roles),
    });
  }

  /** Adds a text channel, and its guild if it's new. Members belong to every guild. */
  addChannel(guildId: string, channelId: string): void {
    this.guilds.add(guildId);
    this.channels.set(channelId, guildId);
  }

  /** Adds a custom emoji the bot can use. */
  addEmoji({ id, name }: { id: string; name: string }): void {
    this.emojis.set(id, name);
  }

  /** Registers the bot's slash commands, as the bot does with Discord at startup. */
  registerCommands(
    builders: ReadonlyArray<{ toJSON(): RegisteredCommand }>,
  ): void {
    for (const builder of builders) {
      const command = builder.toJSON();
      this.commands.set(command.name, command);
    }
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

  /** Replies and follow-ups a user received on their interactions (ephemeral or not). */
  repliesTo(userId: string): FakeMessage[] {
    return this.messages.filter(
      (message) =>
        message.location.kind === 'reply' && message.location.userId === userId,
    );
  }

  /** Every modal shown to `userId`, as Discord received it. */
  modalsShownTo(userId: string): APIModalInteractionResponseCallbackData[] {
    return this.shownModals
      .filter((shown) => shown.userId === userId)
      .map(({ modal }) => modal);
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
    // a slash command reaches the bot only from a guild it's in, from a member
    if (!this.guilds.has(guildId)) {
      throw new Error(
        `The bot is not in guild ${guildId}, so Discord can't deliver its commands`,
      );
    }
    if (!this.members.has(userId)) {
      throw new Error(
        `${userId} is not a member of guild ${guildId}, so they can't run /${commandName}`,
      );
    }
    const registered = this.commands.get(commandName);
    if (!registered) {
      throw new Error(
        `No /${commandName} command is registered (registered: ${[...this.commands.keys()].join(', ') || 'none'})`,
      );
    }
    const given = new Map<string, GivenOption>();
    for (const [name, value] of Object.entries(options)) {
      if (value !== null) {
        given.set(name, { type: ApplicationCommandOptionType.String, value });
      }
    }
    for (const [name, { url }] of Object.entries(attachments)) {
      given.set(name, {
        type: ApplicationCommandOptionType.Attachment,
        value: url,
      });
    }
    assertSendable(registered, given);

    const ack: Acknowledgement = { deferred: false, replied: false };
    let reply: FakeMessage | undefined;
    // a deferred reply's visibility is fixed when it is deferred
    let deferredEphemeral: boolean | undefined;
    const show = (payload: ReplyPayload) => Promise.try(() => showNow(payload));
    const showNow = (payload: ReplyPayload) => {
      const { ephemeral, message } = splitReply(payload);
      if (reply) {
        reply.apply(message);
      } else {
        reply = this.createMessage(
          { kind: 'reply', userId, ephemeral: deferredEphemeral ?? ephemeral },
          message,
        );
      }
      ack.replied = true;
      return reply.toMessage<true>();
    };

    const interaction = withAckFlags(
      mockOf<ChatInputCommandInteraction<'cached'>>({
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
          // the fake's commands have no subcommands
          getSubcommand: (required = true) => {
            if (required) {
              throw discordjsError(
                DiscordjsErrorCodes.CommandInteractionOptionNoSubcommand,
                [],
                DiscordjsTypeError,
              );
            }
            return null;
          },
        },
        deferReply: (options: { flags?: MessageFlagsResolvable } = {}) => {
          if (answered(ack)) return alreadyReplied();
          ack.deferred = true;
          deferredEphemeral = isEphemeral(options.flags);
          return Promise.resolve();
        },
        reply: (payload: ReplyPayload) =>
          answered(ack) ? alreadyReplied() : show(payload),
        editReply: (payload: ReplyPayload) =>
          answered(ack) ? show(payload) : notReplied(),
        followUp: (payload: ReplyPayload) =>
          answered(ack)
            ? Promise.try(() => {
                const { ephemeral, message } = splitReply(payload);
                return this.createMessage(
                  { kind: 'reply', userId, ephemeral },
                  message,
                ).toMessage<true>();
              })
            : notReplied(),
        inCachedGuild: () => true,
        isChatInputCommand: () => true,
      }),
      ack,
    );

    this.client.emit(Events.InteractionCreate, interaction);

    return {
      interaction,
      reply: () => {
        if (!reply) throw new Error(`/${commandName} has not replied yet`);
        return reply;
      },
    };
  }

  /** `userId` reacts to `message` with `emoji` (a unicode emoji, a custom emoji or its mention). */
  react(message: FakeMessage, emoji: unknown, userId: string): void {
    assertInteractive(message, userId);
    const reaction = resolveEmoji(emoji);
    if (message.reactions.get(reactionKey(reaction))?.has(userId)) {
      // Discord only reports a reaction being added, not one already there
      throw new Error(
        `${userId} already reacted ${reaction.name} to message ${message.id}`,
      );
    }
    message.addReaction(reactionKey(reaction), userId);
    this.client.emit(
      Events.MessageReactionAdd,
      mockOf<MessageReaction>({
        partial: false,
        emoji: reaction,
        message: message.toMessage<true>(),
      }),
      this.user(userId),
    );
  }

  click(message: FakeMessage, customId: string, userId: string): void {
    assertInteractive(message, userId);
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
      this.componentInteraction<ButtonInteraction>(message, userId, customId, {
        isButton: () => true,
        isStringSelectMenu: () => false,
      }),
    );
  }

  /** Picks `value` in the message's only select menu. */
  choose(message: FakeMessage, value: string, userId: string): void {
    assertInteractive(message, userId);
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
      this.componentInteraction<StringSelectMenuInteraction>(
        message,
        userId,
        menu.customId,
        {
          values: [value],
          isButton: () => false,
          isStringSelectMenu: () => true,
        },
      ),
    );
  }

  /**
   * Submits the modal open for `userId` with `fields` (input custom id →
   * value), refusing what the Discord client wouldn't let them submit.
   */
  submitModal(userId: string, fields: Record<string, string>): void {
    const open = this.openModals.get(userId);
    if (!open) {
      throw new Error(`No modal is open for ${userId}`);
    }
    const { modal, message } = open;
    const inputs = textInputsOf(modal);
    const values = new Map(
      inputs.map(({ customId }) => [customId, fields[customId] ?? '']),
    );
    for (const id of Object.keys(fields)) {
      if (!values.has(id)) {
        throw new Error(`Modal "${modal.custom_id}" has no input "${id}"`);
      }
    }
    for (const { customId, required, minLength, maxLength } of inputs) {
      const { length } = values.get(customId) ?? '';
      if (
        (required && length === 0) ||
        (length > 0 && length < minLength) ||
        length > maxLength
      ) {
        throw new Error(
          `Discord won't submit "${customId}" in modal "${modal.custom_id}" with ${length} characters (required: ${required}, ${minLength}-${maxLength})`,
        );
      }
    }

    const ack: Acknowledgement = { deferred: false, replied: false };
    this.pressed.push({ customId: modal.custom_id, ack });
    const submit = withAckFlags(
      mockOf<ModalSubmitInteraction>({
        ...this.responses(message, userId, ack),
        customId: modal.custom_id,
        user: this.user(userId),
        message: message.toMessage(),
        fields: {
          getTextInputValue: (id: string) => {
            const value = values.get(id);
            if (value === undefined) {
              throw discordjsError(
                DiscordjsErrorCodes.ModalSubmitInteractionFieldNotFound,
                [id],
                DiscordjsTypeError,
              );
            }
            return value;
          },
        },
        isFromMessage: () => true,
      }),
      ack,
    );
    const accepting = this.modalWaiters.filter(
      ({ filter }) => filter === undefined || filter(submit),
    );
    if (accepting.length === 0) {
      throw new Error(
        `Nothing is awaiting ${userId}'s submit of modal "${modal.custom_id}"`,
      );
    }

    this.openModals.delete(userId);
    this.modalWaiters = this.modalWaiters.filter(
      (waiter) => !accepting.includes(waiter),
    );
    for (const waiter of accepting) waiter.resolve(submit);
  }

  /** Times out every prompt the bot is still waiting on. */
  expireAll(): void {
    for (const message of this.messages) message.expire();
    for (const waiter of this.modalWaiters) {
      waiter.reject(collectorTimeoutError());
    }
    this.modalWaiters = [];
    this.openModals.clear();
  }

  // --- DiscordService surface

  /** Like the real one: undefined for a guild the bot isn't in, or for a non-member. */
  getGuildMember({
    memberId,
    guildId,
  }: {
    memberId: string;
    guildId: string;
  }): Promise<GuildMember | undefined> {
    const member = this.guilds.has(guildId)
      ? this.members.get(memberId)
      : undefined;
    return Promise.resolve(member && this.guildMember(member));
  }

  getDisplayName({
    userId,
    guildId,
  }: {
    guildId: string;
    userId: string;
  }): Promise<string> {
    return this.member(guildId, userId).then(({ displayName }) => displayName);
  }

  userHasRole({
    userId,
    guildId,
    roleId,
  }: {
    guildId: string;
    userId: string;
    roleId: string;
  }): Promise<boolean> {
    return this.member(guildId, userId).then(({ roles }) => roles.has(roleId));
  }

  /** Like the real one: the emoji's mention if the bot has it, else ''. */
  getEmojiString(emojiId: string): string {
    return this.emojis.has(emojiId) ? `<:_:${emojiId}>` : '';
  }

  /** Like the real one: the bot's emojis with these names, in the order given. */
  getEmojis(emojiNames: string[]): GuildEmoji[] {
    return emojiNames.flatMap((name) =>
      [...this.emojis]
        .filter(([, emojiName]) => emojiName === name)
        .slice(0, 1)
        .map(([id]) =>
          mockOf<GuildEmoji>({ id, name, toString: () => `<:${name}:${id}>` }),
        ),
    );
  }

  getTextChannel({
    guildId,
    channelId,
  }: {
    guildId: string;
    channelId: string;
  }): Promise<TextChannel | null> {
    const error = this.channelError(guildId, channelId);
    if (error) return Promise.reject(error);
    return Promise.resolve(
      mockOf<TextChannel>({
        id: channelId,
        guildId,
        send: (payload: OutgoingPayload) =>
          Promise.try(() =>
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
    return Promise.try(() => this.dm(userId, message).toMessage<false>());
  }

  deleteMessage(
    guildId: string,
    channelId: string,
    messageId: string,
  ): Promise<Message | undefined> {
    const error = this.channelError(guildId, channelId);
    if (error) return Promise.reject(error);
    const path = `/channels/${channelId}/messages/${messageId}`;
    const message = this.messages.find(
      ({ id, location, deleted }) =>
        id === messageId &&
        location.kind === 'channel' &&
        location.channelId === channelId &&
        !deleted,
    );
    if (!message) {
      return Promise.reject(
        unknownResource(RESTJSONErrorCodes.UnknownMessage, path),
      );
    }
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
      (reacted, emoji) => this.react(reacted, emoji, BOT_USER_ID),
    );
    this.messages.push(message);
    return message;
  }

  /** Rejects like `guilds.fetch` + `members.fetch` for an unknown guild or a non-member. */
  private member(guildId: string, userId: string): Promise<FakeMember> {
    if (!this.guilds.has(guildId)) {
      return Promise.reject(
        unknownResource(RESTJSONErrorCodes.UnknownGuild, `/guilds/${guildId}`),
      );
    }
    const member = this.members.get(userId);
    return member
      ? Promise.resolve(member)
      : Promise.reject(
          unknownResource(
            RESTJSONErrorCodes.UnknownMember,
            `/guilds/${guildId}/members/${userId}`,
          ),
        );
  }

  /**
   * What `guilds.fetch(guildId)` then `guild.channels.fetch(channelId)`
   * raises, if anything: an unknown guild or channel is a 404, and a channel
   * of another guild is discord.js's GuildChannelUnowned.
   */
  private channelError(guildId: string, channelId: string): Error | undefined {
    if (!this.guilds.has(guildId)) {
      return unknownResource(
        RESTJSONErrorCodes.UnknownGuild,
        `/guilds/${guildId}`,
      );
    }
    const owner = this.channels.get(channelId);
    if (owner === undefined) {
      return unknownResource(
        RESTJSONErrorCodes.UnknownChannel,
        `/channels/${channelId}`,
      );
    }
    return owner === guildId
      ? undefined
      : discordjsError(DiscordjsErrorCodes.GuildChannelUnowned);
  }

  private dm(userId: string, payload: OutgoingPayload): FakeMessage {
    if (!this.members.has(userId)) {
      throw unknownResource(RESTJSONErrorCodes.UnknownUser, `/users/${userId}`);
    }
    if (this.failingDms.has(userId)) {
      throw cannotMessageUser(`dm-${userId}`);
    }
    return this.createMessage({ kind: 'dm', userId }, payload);
  }

  private user(userId: string): User {
    const member = this.members.get(userId);
    return mockOf<User>({
      id: userId,
      username: member?.username ?? userId,
      globalName: member?.globalName ?? null,
      // like discord.js's User.displayName; a guild nickname is the member's
      displayName: member?.globalName ?? member?.username ?? userId,
      bot: userId === BOT_USER_ID,
      partial: false,
      displayAvatarURL: () => avatarUrl(userId),
      send: (payload: OutgoingPayload) =>
        Promise.try(() => this.dm(userId, payload).toMessage<false>()),
    });
  }

  /**
   * A member whose role changes apply at once. Stated assumption: in
   * discord.js, `roles.add(id)`/`remove(id)` leave the cached member unchanged
   * until Discord's gateway sends the member update, and an array
   * `add`/`remove` sets the whole role list from that cache. The fake assumes
   * the update has arrived before the bot's next role call, so every call sees
   * current roles.
   */
  private guildMember(member: FakeMember): GuildMember {
    const change =
      (apply: (roleId: string) => void) =>
      (roles: string | readonly string[]) => {
        for (const roleId of [roles].flat()) apply(roleId);
        return Promise.resolve();
      };

    const user = this.user(member.id);
    return mockOf<GuildMember>({
      id: member.id,
      displayName: member.displayName,
      user,
      displayAvatarURL: user.displayAvatarURL,
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
    const post = (payload: ReplyPayload) => {
      const { ephemeral, message: reply } = splitReply(payload);
      this.createMessage({ kind: 'reply', userId, ephemeral }, reply);
    };

    return {
      deferUpdate: () => answer(ack, 'deferred', () => undefined),
      update: (payload: OutgoingPayload) =>
        answer(ack, 'replied', () => message.apply(payload)),
      reply: (payload: ReplyPayload) =>
        answer(ack, 'replied', () => post(payload)),
      followUp: (payload: ReplyPayload) =>
        answered(ack) ? Promise.try(() => post(payload)) : notReplied(),
    };
  }

  private componentInteraction<
    T extends ButtonInteraction | StringSelectMenuInteraction,
  >(
    message: FakeMessage,
    userId: string,
    customId: string,
    specific: Partial<Record<keyof T, unknown>>,
  ): T {
    const ack: Acknowledgement = { deferred: false, replied: false };
    this.pressed.push({ customId, ack });
    return withAckFlags(
      mockOf<T>({
        ...specific,
        ...this.responses(message, userId, ack),
        customId,
        user: this.user(userId),
        message: message.toMessage(),
        // showModal answers the interaction, like reply does
        showModal: (modal: ModalBuilder) =>
          answer(ack, 'replied', () => {
            const shown = modal.toJSON();
            this.shownModals.push({ userId, modal: shown });
            this.openModals.set(userId, { modal: shown, message });
          }),
        // discord.js's typings require `time`, like its runtime does
        awaitModalSubmit: ({
          filter,
        }: {
          filter?: (interaction: ModalSubmitInteraction) => boolean;
          time: number;
        }) =>
          new Promise<ModalSubmitInteraction>((resolve, reject) => {
            this.modalWaiters.push({ filter, resolve, reject });
          }),
      }),
      ack,
    );
  }
}
