import { EventEmitter } from 'node:events';
import {
  type APIEmbed,
  ComponentType,
  DiscordAPIError,
  DiscordjsError,
  DiscordjsErrorCodes,
  DiscordjsTypeError,
  EmbedBuilder,
  HTTPError,
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
  if (
    componentType === ComponentType.ChannelSelect &&
    !interaction.isChannelSelectMenu()
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
  /** option values, for string select menus */
  values: string[];
  /** how many values a select menu takes (Discord's defaults are 1 and 1) */
  minValues: number;
  maxValues: number;
  /** the channel types a channel select menu offers (empty: every type) */
  channelTypes: number[];
}

const numberIn = (value: object, key: string): number | undefined => {
  const found: unknown = Reflect.get(value, key);
  return typeof found === 'number' ? found : undefined;
};

function channelTypesIn(value: object): number[] {
  const types: unknown = Reflect.get(value, 'channel_types');
  return Array.isArray(types)
    ? types.filter((type): type is number => typeof type === 'number')
    : [];
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
  const error: unknown = Reflect.construct(ErrorClass, [code, ...args]);
  if (!(error instanceof ErrorClass))
    throw new Error('expected a DiscordjsError');
  return error;
}

/** The DiscordAPIError the REST API returns for a resource that doesn't exist. */
export function unknownResource(
  code:
    | RESTJSONErrorCodes.UnknownChannel
    | RESTJSONErrorCodes.UnknownGuild
    | RESTJSONErrorCodes.UnknownMember
    | RESTJSONErrorCodes.UnknownMessage
    | RESTJSONErrorCodes.UnknownRole
    | RESTJSONErrorCodes.UnknownUser,
  path: string,
  method = 'GET',
): DiscordAPIError {
  const message = {
    [RESTJSONErrorCodes.UnknownChannel]: 'Unknown Channel',
    [RESTJSONErrorCodes.UnknownGuild]: 'Unknown Guild',
    [RESTJSONErrorCodes.UnknownMember]: 'Unknown Member',
    [RESTJSONErrorCodes.UnknownMessage]: 'Unknown Message',
    [RESTJSONErrorCodes.UnknownRole]: 'Unknown Role',
    [RESTJSONErrorCodes.UnknownUser]: 'Unknown User',
  }[code];
  return new DiscordAPIError({ message, code }, code, 404, method, path, {
    body: undefined,
    files: undefined,
  });
}

/** The HTTPError discord.js throws when Discord answers with a server error (an outage). */
export function discordUnavailable(method: string, path: string): HTTPError {
  return new HTTPError(
    500,
    'Internal Server Error',
    method,
    `https://discord.com/api/v10${path}`,
    { body: undefined, files: undefined },
  );
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

/** The DiscordAPIError the API returns when the bot may not do something (e.g. manage a role above its own). */
export function missingPermissions(
  method: string,
  path: string,
): DiscordAPIError {
  const code = RESTJSONErrorCodes.MissingPermissions;
  return new DiscordAPIError(
    { message: 'Missing Permissions', code },
    code,
    403,
    method,
    path,
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
            minValues: numberIn(value, 'min_values') ?? 1,
            maxValues: numberIn(value, 'max_values') ?? 1,
            channelTypes: channelTypesIn(value),
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

/** Everything a user sees of a message: where it is, its text, embeds, controls and reactions, and whether it's still there. */
export function shown(message: FakeMessage) {
  const { location, content, embeds, components, deleted } = message;
  return {
    location,
    content,
    embeds,
    components,
    reactions: reactionsOn(message),
    deleted,
  };
}

/** Who reacted to a message, by emoji key (a unicode emoji, or a custom emoji's id). */
function reactionsOn(message: FakeMessage): Record<string, string[]> {
  return Object.fromEntries(
    [...message.reactions].map(([emoji, users]) => [emoji, [...users]]),
  );
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

  /** The message's components of one type (e.g. its string select menus). */
  componentsOfType(componentType: ComponentType): ComponentRef[] {
    return componentsIn(this.components).filter(
      ({ type }) => type === componentType,
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
    const waiters = [...this.waiters].filter((waiter) =>
      accepts(waiter.options, interaction),
    );
    const collectors = [...this.collectors].filter((collector) =>
      accepts(collector.options, interaction),
    );
    if (waiters.length === 0 && collectors.length === 0) {
      throw new Error(
        `Nothing on message ${this.id} is waiting for this interaction`,
      );
    }
    for (const waiter of waiters) {
      this.waiters.delete(waiter);
      waiter.resolve(interaction);
    }
    for (const collector of collectors) {
      collector.emit('collect', interaction);
    }
  }

  /**
   * Where the message is. A reply is in the channel its interaction came
   * from, which the fake doesn't track, so it refuses.
   */
  private located(): Exclude<MessageLocation, { kind: 'reply' }> {
    const { location } = this;
    if (location.kind === 'reply') {
      throw new Error(`DiscordMock does not model where reply ${this.id} is`);
    }
    return location;
  }

  private get channelId(): string {
    const location = this.located();
    return location.kind === 'channel'
      ? location.channelId
      : `dm-${location.userId}`;
  }

  /** Rejects like the API does for a message that no longer exists. */
  private unknown(method: string, path = ''): Promise<never> {
    return Promise.reject(
      unknownResource(
        RESTJSONErrorCodes.UnknownMessage,
        `/channels/${this.channelId}/messages/${this.id}${path}`,
        method,
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

    return mockOf<Message<InGuild>>({
      id: this.id,
      get channelId() {
        return fake.channelId;
      },
      get guildId() {
        const located = fake.located();
        return located.kind === 'channel' ? located.guildId : null;
      },
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
      inGuild: () => fake.located().kind === 'channel',
      edit: (payload: OutgoingPayload) => {
        if (fake.deleted) return fake.unknown('PATCH');
        return Promise.try(() => {
          fake.apply(payload);
          return fake.toMessage();
        });
      },
      delete: () => {
        if (fake.deleted) return fake.unknown('DELETE');
        fake.deleted = true;
        return Promise.resolve(fake.toMessage());
      },
      react: (emoji: unknown) => {
        const reaction = resolveEmoji(emoji);
        if (fake.deleted) {
          return fake.unknown('PUT', `/reactions/${reactionKey(reaction)}/@me`);
        }
        return Promise.try(() => fake.onReact(fake, reaction));
      },
      reactions: {
        cache: {
          get: (emoji: string) =>
            fake.reactions.has(emoji)
              ? {
                  users: {
                    remove: (userId: string) => {
                      if (fake.deleted) {
                        return fake.unknown(
                          'DELETE',
                          `/reactions/${emoji}/${userId}`,
                        );
                      }
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
