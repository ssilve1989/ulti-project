import { EventEmitter } from 'node:events';
import {
  type APIEmbed,
  ComponentType,
  DiscordAPIError,
  DiscordjsError,
  DiscordjsErrorCodes,
  EmbedBuilder,
  type Interaction,
  isJSONEncodable,
  type Message,
} from 'discord.js';
import { mockOf } from '../mock-factory.js';

export type MessageLocation =
  | { kind: 'channel'; guildId: string; channelId: string }
  | { kind: 'dm'; userId: string }
  | { kind: 'reply'; userId: string };

type OutgoingEmbed = Parameters<typeof EmbedBuilder.from>[0];

/** The subset of discord.js send/edit/reply options the fake understands. */
export type OutgoingPayload =
  | string
  | {
      content?: string | null;
      embeds?: readonly OutgoingEmbed[] | null;
      components?: readonly unknown[] | null;
    };

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
  ...args: unknown[]
): Error {
  return Reflect.construct(DiscordjsError, [code, ...args]);
}

/** The DiscordAPIError the REST API returns for a resource that doesn't exist. */
export function unknownResource(
  code: 10003 | 10007 | 10008 | 10013,
  path: string,
): DiscordAPIError {
  const message = {
    10003: 'Unknown Channel',
    10007: 'Unknown Member',
    10008: 'Unknown Message',
    10013: 'Unknown User',
  }[code];
  return new DiscordAPIError({ message, code }, code, 404, 'GET', path, {
    body: undefined,
    files: undefined,
  });
}

/** The error discord.js raises when a collector ends without an interaction. */
export function collectorTimeoutError(): Error {
  return discordjsError(DiscordjsErrorCodes.InteractionCollectorError, 'time');
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
    /** Called when the author reacts, so the gateway event can be emitted. */
    private readonly onAuthorReaction: (
      message: FakeMessage,
      emoji: string,
    ) => void,
  ) {
    this.apply(payload);
  }

  apply(payload: OutgoingPayload): void {
    if (typeof payload === 'string') {
      this.content = payload;
      return;
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
      unknownResource(10008, `/channels/messages/${this.id}`),
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

  /** The discord.js-shaped view of this message handed to app code. */
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
        fake.apply(payload);
        return Promise.resolve(fake.toMessage());
      },
      delete: () => {
        if (fake.deleted) return fake.unknown();
        fake.deleted = true;
        return Promise.resolve(fake.toMessage());
      },
      react: (emoji: unknown) => {
        if (fake.deleted) return fake.unknown();
        const name = String(emoji);
        fake.addReaction(name, fake.authorId);
        fake.onAuthorReaction(fake, name);
        return Promise.resolve();
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
