import { EventEmitter } from 'node:events';
import {
  type APIModalInteractionResponseCallbackData,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  type Client,
  type CommandInteractionOption,
  CommandInteractionOptionResolver,
  ComponentType,
  DiscordjsErrorCodes,
  DiscordjsTypeError,
  Events,
  type Message,
  MessageFlags,
  MessageFlagsBitField,
  type MessageFlagsResolvable,
  type MessageReaction,
  type ModalBuilder,
  type ModalSubmitInteraction,
  type PermissionResolvable,
  ReactionType,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { mockOf } from '../mock-factory.js';
import {
  assertPermitted,
  commandOptions,
  type OptionTargets,
  type OptionValue,
  type RegisteredCommand,
} from './command-options.js';
import {
  BOT_USER_ID,
  type FakeChannel,
  type FakeMember,
  type FakeRole,
  type FakeUser,
  FakeViews,
  type FakeWorld,
  permissionsOf,
} from './fake-client.js';
import {
  type ComponentRef,
  collectorTimeoutError,
  discordjsError,
  FakeMessage,
  type MessageLocation,
  type OutgoingPayload,
  reactionKey,
  resolveEmoji,
} from './fake-message.js';

export { avatarUrl, BOT_USER_ID } from './fake-client.js';

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
 * A command's reply: shown once, then edited in place. A deferred reply's
 * visibility is fixed when it is deferred.
 */
class CommandReply {
  private readonly userId: string;
  private readonly create: (
    location: MessageLocation,
    payload: OutgoingPayload,
  ) => FakeMessage;
  private message: FakeMessage | undefined;
  private deferredEphemeral: boolean | undefined;

  constructor(
    userId: string,
    create: (
      location: MessageLocation,
      payload: OutgoingPayload,
    ) => FakeMessage,
  ) {
    this.userId = userId;
    this.create = create;
  }

  /** The reply, once one has been shown. */
  sent(): FakeMessage | undefined {
    return this.message;
  }

  defer(flags: MessageFlagsResolvable | undefined): void {
    this.deferredEphemeral = isEphemeral(flags);
  }

  show(payload: ReplyPayload): Message<true> {
    const { ephemeral, message } = splitReply(payload);
    if (this.message) {
      this.message.apply(message);
      return this.message.toMessage<true>();
    }
    this.message = this.create(
      {
        kind: 'reply',
        userId: this.userId,
        ephemeral: this.deferredEphemeral ?? ephemeral,
      },
      message,
    );
    return this.message.toMessage<true>();
  }
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

/** discord.js's own option resolver over the options the fake resolved. */
function optionResolver(
  client: Client,
  options: readonly CommandInteractionOption<'cached'>[],
): CommandInteractionOptionResolver<'cached'> {
  // its constructor is library-internal in the typings, like DiscordjsError's
  return Reflect.construct(CommandInteractionOptionResolver, [
    client,
    options,
    {},
  ]);
}

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
 * The message's only select menu of `type`, if `userId` could pick `values`
 * in it: it's enabled and takes that many values.
 */
function pickableMenu(
  message: FakeMessage,
  type: ComponentType,
  values: readonly string[],
  userId: string,
): ComponentRef {
  assertInteractive(message, userId);
  const [menu, ...others] = message.componentsOfType(type);
  if (menu === undefined || others.length > 0) {
    throw new Error(
      `Message ${message.id} must have exactly one ${ComponentType[type]} menu to choose from`,
    );
  }
  if (menu.disabled) {
    throw new Error(
      `Select menu "${menu.customId}" on message ${message.id} is disabled`,
    );
  }
  if (values.length < menu.minValues || values.length > menu.maxValues) {
    throw new Error(
      `Select menu "${menu.customId}" takes ${menu.minValues}-${menu.maxValues} values, not ${values.length}`,
    );
  }
  return menu;
}

/**
 * A small Discord world (guilds, roles, members, channels, messages) behind a
 * fake discord.js client, which the app's real DiscordService and handlers use
 * in flow specs. Tests set the world up, drive the bot the way Discord would
 * (commands, clicks, reactions), and assert on what the bot sent.
 */
export class DiscordMock {
  private readonly members = new Map<string, FakeMember>();
  /** Discord users who aren't in any of the bot's guilds */
  private readonly users = new Map<string, FakeUser>();
  private readonly commands = new Map<string, RegisteredCommand>();
  /** The bot's emoji cache: id → name */
  private readonly emojis = new Map<string, string>();
  /** guildId → its roles (besides @everyone), by id */
  private readonly guilds = new Map<string, Map<string, FakeRole>>();
  private readonly channels = new Map<string, FakeChannel>();
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
  private readonly views = new FakeViews(this.world());
  /** The discord.js Client the app gets; it subscribes to gateway events on it. */
  readonly client = this.views.client(new EventEmitter());

  // --- world setup

  addMember({
    id,
    username,
    globalName = null,
    displayName = globalName ?? username,
    roles = [],
    permissions = [],
  }: {
    id: string;
    username: string;
    globalName?: string | null;
    /** the guild display name (a nickname); defaults to the global name */
    displayName?: string;
    /** roles the member holds; each must have been added with addRole */
    roles?: readonly string[];
    /** the member's guild permissions (e.g. Administrator) */
    permissions?: PermissionResolvable;
  }): void {
    const unknown = roles.filter((roleId) => !this.hasRole(roleId));
    if (unknown.length > 0) {
      throw new Error(`No guild has role ${unknown.join(', ')}; add it first`);
    }
    this.members.set(id, {
      id,
      username,
      globalName,
      displayName,
      permissions: permissionsOf(permissions),
      roles: new Set(roles),
    });
  }

  /** The member leaves the server; Discord still knows them as a user. */
  removeMember(userId: string): void {
    const member = this.members.get(userId);
    if (!member) throw new Error(`${userId} is not a member`);
    this.members.delete(userId);
    const { id, username, globalName } = member;
    this.users.set(userId, { id, username, globalName });
  }

  /** Adds a Discord user who isn't in the bot's guilds (e.g. one who left). */
  addUser({
    id,
    username,
    globalName = null,
  }: {
    id: string;
    username: string;
    globalName?: string | null;
  }): void {
    this.users.set(id, { id, username, globalName });
  }

  /** Adds a text channel, and its guild if it's new. Members belong to every guild. */
  addChannel(guildId: string, channelId: string, name = channelId): void {
    this.addGuild(guildId);
    this.channels.set(channelId, { id: channelId, guildId, name });
  }

  /** Adds a role to a guild, and the guild if it's new. */
  addRole(guildId: string, role: FakeRole): void {
    this.addGuild(guildId).set(role.id, role);
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
    subcommand,
    options = {},
    attachments = {},
  }: {
    userId: string;
    guildId: string;
    commandName: string;
    subcommand?: string;
    /** option values; users, roles and channels are given by id */
    options?: Record<string, OptionValue | null>;
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
    const member = this.members.get(userId);
    if (!member) {
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
    assertPermitted(registered, userId, member.permissions);
    const resolverOptions = commandOptions(
      registered,
      { subcommand, options, attachments },
      this.optionTargets(guildId),
    );

    const ack: Acknowledgement = { deferred: false, replied: false };
    const reply = new CommandReply(userId, (location, payload) =>
      this.createMessage(location, payload),
    );
    const show = (payload: ReplyPayload) =>
      Promise.try(() => {
        const shown = reply.show(payload);
        ack.replied = true;
        return shown;
      });

    const interaction = withAckFlags(
      mockOf<ChatInputCommandInteraction<'cached'>>({
        commandName,
        guildId,
        user: this.views.user(userId),
        member: this.views.member(guildId, member),
        memberPermissions: member.permissions,
        // discord.js's own resolver, so option getters behave as in production
        options: optionResolver(this.client, resolverOptions),
        deferReply: (options: { flags?: MessageFlagsResolvable } = {}) => {
          if (answered(ack)) return alreadyReplied();
          ack.deferred = true;
          reply.defer(options.flags);
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
        const sent = reply.sent();
        if (!sent) throw new Error(`/${commandName} has not replied yet`);
        return sent;
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
      this.views.user(userId),
      { type: ReactionType.Normal, burst: false },
    );
  }

  click(message: FakeMessage, customId: string, userId: string): void {
    assertInteractive(message, userId);
    const buttons = message.componentsOfType(ComponentType.Button);
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
      this.componentInteraction<ButtonInteraction>(
        message,
        userId,
        customId,
        ComponentType.Button,
      ),
    );
  }

  /** Picks `values` (one, or several if it allows) in the message's only select menu. */
  choose(
    message: FakeMessage,
    values: string | readonly string[],
    userId: string,
  ): void {
    const picked = [values].flat();
    const menu = pickableMenu(
      message,
      ComponentType.StringSelect,
      picked,
      userId,
    );
    const unoffered = picked.filter((value) => !menu.values.includes(value));
    if (unoffered.length > 0) {
      throw new Error(
        `Select menu "${menu.customId}" does not offer "${unoffered.join('", "')}" (offers: ${menu.values.join(', ')})`,
      );
    }
    message.dispatch(
      this.componentInteraction<StringSelectMenuInteraction>(
        message,
        userId,
        menu.customId,
        ComponentType.StringSelect,
        { values: picked },
      ),
    );
  }

  /** Picks `channelIds` in the message's only channel select menu. */
  chooseChannels(
    message: FakeMessage,
    channelIds: readonly string[],
    userId: string,
  ): void {
    const menu = pickableMenu(
      message,
      ComponentType.ChannelSelect,
      channelIds,
      userId,
    );
    const offered = ({ channelTypes }: { channelTypes: number[] }) =>
      channelTypes.length === 0 || channelTypes.includes(ChannelType.GuildText);
    const unknown = channelIds.filter((id) => !this.channels.has(id));
    if (unknown.length > 0 || !offered(menu)) {
      throw new Error(
        `Channel select menu "${menu.customId}" can't offer ${[...unknown, ...(offered(menu) ? [] : ['text channels'])].join(', ')}`,
      );
    }
    message.dispatch(
      this.componentInteraction<ChannelSelectMenuInteraction>(
        message,
        userId,
        menu.customId,
        ComponentType.ChannelSelect,
        { values: [...channelIds] },
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
        user: this.views.user(userId),
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

  /** What the discord.js views read from, and do to, this fake's state. */
  private world(): FakeWorld {
    return {
      guildIds: () => [...this.guilds.keys()],
      roles: (guildId) => [...(this.guilds.get(guildId)?.values() ?? [])],
      channel: (channelId) => this.channels.get(channelId),
      members: () => [...this.members.values()],
      member: (userId) => this.members.get(userId),
      user: (userId) => this.members.get(userId) ?? this.users.get(userId),
      emojis: () => this.emojis,
      canBeMessaged: (userId) => !this.failingDms.has(userId),
      post: ({ guildId, id }, payload) =>
        this.createMessage(
          { kind: 'channel', guildId, channelId: id },
          payload,
        ),
      dm: (userId, payload) =>
        this.createMessage({ kind: 'dm', userId }, payload),
      message: (channelId, messageId) =>
        this.channel(channelId).find(({ id }) => id === messageId),
    };
  }

  /** The users, roles and channels of `guildId` a command option can pick. */
  private optionTargets(guildId: string): OptionTargets {
    return {
      // Discord resolves any user; only a guild member comes with a member
      user: (userId) => {
        const member = this.members.get(userId);
        if (member) {
          return {
            user: this.views.user(userId),
            member: this.views.member(guildId, member),
          };
        }
        return this.users.has(userId)
          ? { user: this.views.user(userId) }
          : undefined;
      },
      role: (roleId) => {
        const role = this.guilds.get(guildId)?.get(roleId);
        return role && this.views.role(guildId, role);
      },
      channel: (channelId) => {
        const channel = this.channels.get(channelId);
        return channel?.guildId === guildId
          ? this.views.channel(channel)
          : undefined;
      },
    };
  }

  private addGuild(guildId: string): Map<string, FakeRole> {
    const roles = this.guilds.get(guildId) ?? new Map<string, FakeRole>();
    this.guilds.set(guildId, roles);
    return roles;
  }

  private hasRole(roleId: string): boolean {
    return [...this.guilds.values()].some((roles) => roles.has(roleId));
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
      // once deferred or updated, the interaction's reply is the message itself
      editReply: (payload: OutgoingPayload) =>
        answered(ack)
          ? Promise.try(() => {
              message.apply(payload);
              return message.toMessage();
            })
          : notReplied(),
    };
  }

  private componentInteraction<
    T extends
      | ButtonInteraction
      | StringSelectMenuInteraction
      | ChannelSelectMenuInteraction,
  >(
    message: FakeMessage,
    userId: string,
    customId: string,
    componentType: ComponentType,
    specific: Partial<Record<keyof T, unknown>> = {},
  ): T {
    const ack: Acknowledgement = { deferred: false, replied: false };
    this.pressed.push({ customId, ack });
    return withAckFlags(
      mockOf<T>({
        ...specific,
        ...this.responses(message, userId, ack),
        componentType,
        isButton: () => componentType === ComponentType.Button,
        isStringSelectMenu: () => componentType === ComponentType.StringSelect,
        isChannelSelectMenu: () =>
          componentType === ComponentType.ChannelSelect,
        customId,
        user: this.views.user(userId),
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
