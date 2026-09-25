import { EventEmitter } from 'node:events';
import {
  type APIEmbed,
  ComponentType,
  DiscordAPIError,
  DiscordjsError,
  DiscordjsErrorCodes,
  DiscordjsTypeError,
  EmbedBuilder,
  type Interaction,
  isJSONEncodable,
  type Message,
  RESTJSONErrorCodes,
} from 'discord.js';
import { mockOf } from '../mock-factory.js';

export type MessageLocation =
  | { kind: 'channel'; guildId: string; channelId: string }
  | { kind: 'dm'; userId: string }
  /** an interaction response; ephemeral ones only `userId` can see */
  | { kind: 'reply'; userId: string; ephemeral: boolean };

type OutgoingEmbed = Parameters<typeof EmbedBuilder.from>[0];

/** The subset of discord.js send/edit/reply options the fake understands. */
export type OutgoingPayload =
  | string
  | {
      content?: string | null;
      embeds?: readonly OutgoingEmbed[] | null;
      components?: readonly unknown[] | null;
    };

const SUPPORTED_PAYLOAD_KEYS = new Set(['content', 'embeds', 'components']);

type InteractionFilter = (interaction: Interaction) => boolean;

/** The options awaitMessageComponent / createMessageComponentCollector honour. */
interface CollectOptions {
  filter?: InteractionFilter;
  componentType?: ComponentType;
}

/** Whether an interaction gets past a collector's componentType and filter, as in discord.js. */
function accepts(
  { filter, componentType }: CollectOptions,
  interaction: Interaction,
): boolean {
  if (componentType === ComponentType.Button && !interaction.isButton()) {
    return false;
  }
  if (
    componentType === ComponentType.StringSelect &&
    !interaction.isStringSelectMenu()
  ) {
    return false;
  }
  return filter === undefined || filter(interaction);
}

interface Waiter {
  options: CollectOptions;
  resolve: (interaction: Interaction) => void;
  reject: (error: Error) => void;
}

export interface ComponentRef {
  customId: string;
  type: number;
  disabled: boolean;
  /** option values, for select menus */
  values: string[];
}

/**
 * Builds the `DiscordjsError` discord.js itself throws. Its constructor is
 * library-internal in the typings, so it's invoked through Reflect.construct;
 * production code checks `instanceof DiscordjsError`, so a look-alike won't do.
 */
export function discordjsError(
  code: DiscordjsErrorCodes,
  args: readonly unknown[] = [],
  ErrorClass:
    | typeof DiscordjsError
    | typeof DiscordjsTypeError = DiscordjsError,
): Error {
  return Reflect.construct(ErrorClass, [code, ...args]);
}

/** The DiscordAPIError the REST API returns for a resource that doesn't exist. */
export function unknownResource(
  code:
    | RESTJSONErrorCodes.UnknownChannel
    | RESTJSONErrorCodes.UnknownGuild
    | RESTJSONErrorCodes.UnknownMember
    | RESTJSONErrorCodes.UnknownMessage
    | RESTJSONErrorCodes.UnknownUser,
  path: string,
): DiscordAPIError {
  const message = {
    [RESTJSONErrorCodes.UnknownChannel]: 'Unknown Channel',
    [RESTJSONErrorCodes.UnknownGuild]: 'Unknown Guild',
    [RESTJSONErrorCodes.UnknownMember]: 'Unknown Member',
    [RESTJSONErrorCodes.UnknownMessage]: 'Unknown Message',
    [RESTJSONErrorCodes.UnknownUser]: 'Unknown User',
  }[code];
  return new DiscordAPIError({ message, code }, code, 404, 'GET', path, {
    body: undefined,
    files: undefined,
  });
}

/** The DiscordAPIError the API returns when a user doesn't accept DMs from the bot. */
export function cannotMessageUser(channelId: string): DiscordAPIError {
  const code = RESTJSONErrorCodes.CannotSendMessagesToThisUser;
  return new DiscordAPIError(
    { message: 'Cannot send messages to this user', code },
    code,
    403,
    'POST',
    `/channels/${channelId}/messages`,
    { body: undefined, files: undefined },
  );
}

/** The error discord.js raises when a collector ends without an interaction. */
export function collectorTimeoutError(): Error {
  return discordjsError(DiscordjsErrorCodes.InteractionCollectorError, [
    'time',
  ]);
}

function optionValues(value: object): string[] {
  if (!('options' in value) || !Array.isArray(value.options)) return [];
  return value.options.flatMap((option: unknown) =>
    typeof option === 'object' &&
    option !== null &&
    'value' in option &&
    typeof option.value === 'string'
      ? [option.value]
      : [],
  );
}

function componentsIn(value: unknown): ComponentRef[] {
  if (Array.isArray(value)) return value.flatMap(componentsIn);
  if (typeof value !== 'object' || value === null) return [];
  const own =
    'custom_id' in value &&
    typeof value.custom_id === 'string' &&
    'type' in value &&
    typeof value.type === 'number'
      ? [
          {
            customId: value.custom_id,
            type: value.type,
            disabled: 'disabled' in value && value.disabled === true,
            values: optionValues(value),
          },
        ]
      : [];
  const nested = 'components' in value ? componentsIn(value.components) : [];
  return [...own, ...nested];
}

class FakeCollector extends EventEmitter {
  constructor(
    readonly options: CollectOptions,
    private readonly onStop: (collector: FakeCollector) => void,
  ) {
    super();
  }

  stop(reason = 'user'): void {
    this.onStop(this);
    this.emit('end', new Map(), reason);
  }
}

/** An emoji as a reaction carries it: custom emojis have an id, unicode ones don't. */
export interface ReactionEmoji {
  id: string | null;
  name: string;
}

/**
 * What discord.js's resolvePartialEmoji makes of an emoji passed to react():
 * a custom emoji (a GuildEmoji, or its `<:name:id>` mention) keeps its name
 * and id, and a unicode emoji is just its name.
 */
export function resolveEmoji(emoji: unknown): ReactionEmoji {
  if (typeof emoji === 'string') {
    const custom = /^<a?:(\w+):(\d+)>$/.exec(emoji);
    return custom?.[1] && custom[2]
      ? { id: custom[2], name: custom[1] }
      : { id: null, name: emoji };
  }
  if (typeof emoji === 'object' && emoji !== null) {
    const id: unknown = Reflect.get(emoji, 'id');
    const name: unknown = Reflect.get(emoji, 'name');
    // a GuildEmoji, or an emoji already resolved (unicode ones have a null id)
    if ((typeof id === 'string' || id === null) && typeof name === 'string') {
      return { id, name };
    }
  }
  throw new Error(`FakeMessage can't react with ${String(emoji)}`);
}

/** How discord.js keys a reaction in a message's reaction cache. */
export const reactionKey = ({ id, name }: ReactionEmoji) => id ?? name;

/** Everything a user sees of a message: where it is, its text, embeds and controls. */
export function shown({ location, content, embeds, components }: FakeMessage) {
  return { location, content, embeds, components };
}

export class FakeMessage {
  content: string | undefined;
  embeds: APIEmbed[] = [];
  components: unknown[] = [];
  deleted = false;
  /** emoji → ids of the users who reacted with it */
  readonly reactions = new Map<string, Set<string>>();
  private readonly waiters = new Set<Waiter>();
  private readonly collectors = new Set<FakeCollector>();

  constructor(
    readonly id: string,
    readonly location: MessageLocation,
    readonly authorId: string,
    payload: OutgoingPayload,
    /** Called when the author reacts, so the mock can record it and emit the gateway event. */
    private readonly onReact: (
      message: FakeMessage,
      emoji: ReactionEmoji,
    ) => void,
  ) {
    this.apply(payload);
  }

  apply(payload: OutgoingPayload): void {
    if (typeof payload === 'string') {
      this.content = payload;
      return;
    }
    // anything else (allowedMentions, files, flags, …) changes what users see
    // or who gets pinged, so the fake refuses it rather than dropping it
    const unsupported = Object.keys(payload).filter(
      (key) => !SUPPORTED_PAYLOAD_KEYS.has(key),
    );
    if (unsupported.length > 0) {
      throw new Error(
        `FakeMessage does not support message options: ${unsupported.join(', ')}`,
      );
    }
    if (payload.content !== undefined) {
      this.content = payload.content ?? undefined;
    }
    if (payload.embeds) {
      this.embeds = payload.embeds.map((embed) =>
        EmbedBuilder.from(embed).toJSON(),
      );
    }
    if (payload.components) {
      this.components = payload.components.map((component) =>
        isJSONEncodable(component) ? component.toJSON() : component,
      );
    }
  }

  buttons(): ComponentRef[] {
    return componentsIn(this.components).filter(
      ({ type }) => type === ComponentType.Button,
    );
  }

  selectMenus(): ComponentRef[] {
    return componentsIn(this.components).filter(
      ({ type }) => type === ComponentType.StringSelect,
    );
  }

  addReaction(emoji: string, userId: string): void {
    const users = this.reactions.get(emoji) ?? new Set<string>();
    users.add(userId);
    this.reactions.set(emoji, users);
  }

  removeReaction(emoji: string, userId: string): void {
    this.reactions.get(emoji)?.delete(userId);
  }

  /** Hands an interaction to whatever is awaiting or collecting on this message. */
  dispatch(interaction: Interaction): void {
    let handled = false;
    for (const waiter of [...this.waiters]) {
      if (!accepts(waiter.options, interaction)) continue;
      this.waiters.delete(waiter);
      waiter.resolve(interaction);
      handled = true;
    }
    for (const collector of [...this.collectors]) {
      if (!accepts(collector.options, interaction)) continue;
      collector.emit('collect', interaction);
      handled = true;
    }
    if (!handled) {
      throw new Error(
        `Nothing on message ${this.id} is waiting for this interaction`,
      );
    }
  }

  /** Rejects like the API does for a message that no longer exists. */
  private unknown(): Promise<never> {
    return Promise.reject(
      unknownResource(
        RESTJSONErrorCodes.UnknownMessage,
        `/channels/messages/${this.id}`,
      ),
    );
  }

  /** Ends every await/collector on this message as a timeout. */
  expire(): void {
    for (const waiter of [...this.waiters]) {
      this.waiters.delete(waiter);
      waiter.reject(collectorTimeoutError());
    }
    for (const collector of [...this.collectors]) {
      collector.stop('time');
    }
  }

  /**
   * The discord.js-shaped view of this message handed to app code. It's live:
   * stated assumption, like role changes in DiscordMock, that Discord's
   * gateway update for an edit reaches every `Message` the bot holds before
   * the bot reads it again. (discord.js's `edit()` returns an updated clone and
   * updates the cached message only when the gateway's MESSAGE_UPDATE
   * arrives.)
   */
  toMessage<InGuild extends boolean = boolean>(): Message<InGuild> {
    // getters below need the FakeMessage, not the literal they live on
    const fake = this;
    const { location } = this;

    return mockOf<Message<InGuild>>({
      id: this.id,
      channelId:
        location.kind === 'channel'
          ? location.channelId
          : `dm-${location.userId}`,
      guildId: location.kind === 'channel' ? location.guildId : null,
      author: { id: this.authorId },
      get content() {
        return fake.content ?? '';
      },
      get embeds() {
        return fake.embeds;
      },
      get components() {
        return fake.components;
      },
      inGuild: () => location.kind === 'channel',
      edit: (payload: OutgoingPayload) => {
        if (fake.deleted) return fake.unknown();
        return Promise.try(() => {
          fake.apply(payload);
          return fake.toMessage();
        });
      },
      delete: () => {
        if (fake.deleted) return fake.unknown();
        fake.deleted = true;
        return Promise.resolve(fake.toMessage());
      },
      react: (emoji: unknown) => {
        if (fake.deleted) return fake.unknown();
        return Promise.try(() => fake.onReact(fake, resolveEmoji(emoji)));
      },
      reactions: {
        cache: {
          get: (emoji: string) =>
            fake.reactions.has(emoji)
              ? {
                  users: {
                    remove: (userId: string) => {
                      fake.removeReaction(emoji, userId);
                      return Promise.resolve();
                    },
                  },
                }
              : undefined,
        },
      },
      awaitMessageComponent: (options: CollectOptions = {}) =>
        new Promise<Interaction>((resolve, reject) => {
          fake.waiters.add({ options, resolve, reject });
        }),
      createMessageComponentCollector: (options: CollectOptions = {}) => {
        const collector = new FakeCollector(options, (stopped) =>
          fake.collectors.delete(stopped),
        );
        fake.collectors.add(collector);
        return collector;
      },
    });
  }
}
