import type { EventEmitter } from 'node:events';
import {
  ChannelType,
  type Client,
  Collection,
  DiscordjsErrorCodes,
  DiscordjsTypeError,
  type DMChannel,
  type Guild,
  type GuildEmoji,
  type GuildMember,
  MessagePayload,
  PermissionsBitField,
  RESTJSONErrorCodes,
  type Role,
  type TextChannel,
  type User,
} from 'discord.js';
import { mockOf } from '../mock-factory.js';
import {
  cannotMessageUser,
  discordjsError,
  discordUnavailable,
  type FakeMessage,
  missingPermissions,
  type OutgoingPayload,
  unknownResource,
} from './fake-message.js';

export const BOT_USER_ID = 'bot-user';

/** The avatar URL every fake user has. */
export const avatarUrl = (userId: string) =>
  `https://cdn.example/avatars/${userId}.png`;

/** A Discord user, whether or not they're in the bot's guilds. */
export interface FakeUser {
  readonly id: string;
  readonly username: string;
  /** the user's Discord-wide display name, if they set one */
  readonly globalName: string | null;
}

export interface FakeMember extends FakeUser {
  /** the member's name in the guild (their nickname, else their global name) */
  readonly displayName: string;
  /** their guild permissions, as Discord computes them from their roles */
  readonly permissions: PermissionsBitField;
  readonly roles: Set<string>;
}

export interface FakeRole {
  readonly id: string;
  readonly name: string;
  /** above the bot's highest role, so the bot may not give or take it */
  readonly aboveBot?: boolean;
}

/** A guild text channel, the only kind the app uses. */
/** A custom emoji, which belongs to a guild. */
export interface FakeEmoji {
  readonly name: string;
  readonly guildId: string;
}

export interface FakeChannel {
  readonly id: string;
  readonly guildId: string;
  readonly name: string;
}

/** What the discord.js views read from, and do to, the fake's state. */
export interface FakeWorld {
  readonly guildIds: () => string[];
  readonly roles: (guildId: string) => FakeRole[];
  readonly channel: (channelId: string) => FakeChannel | undefined;
  readonly members: () => FakeMember[];
  readonly member: (userId: string) => FakeMember | undefined;
  /** a guild member, or a user who isn't in the guild */
  readonly user: (userId: string) => FakeUser | undefined;
  /** every emoji of the bot's guilds, by id */
  readonly emojis: () => ReadonlyMap<string, FakeEmoji>;
  readonly canBeMessaged: (userId: string) => boolean;
  /** whether the bot may send messages in the channel */
  readonly canPostIn: (channelId: string) => boolean;
  /** whether Discord is failing guild fetches (an outage) */
  readonly guildsUnavailable: () => boolean;
  /** whether the bot's gateway connection is up */
  readonly gatewayConnected: () => boolean;
  readonly post: (
    channel: FakeChannel,
    payload: OutgoingPayload,
  ) => FakeMessage;
  readonly dm: (userId: string, payload: OutgoingPayload) => FakeMessage;
  readonly message: (
    channelId: string,
    messageId: string,
  ) => FakeMessage | undefined;
}

/** The DiscordAPIError for an unknown guild. */
const unknownGuild = (guildId: string) =>
  unknownResource(RESTJSONErrorCodes.UnknownGuild, `/guilds/${guildId}`);

const collectionOf = <T extends { id: string }>(items: readonly T[]) =>
  new Collection(items.map((item) => [item.id, item]));

/**
 * The discord.js views of the fake's state. Every view reads the state when
 * it's used, so a view the bot holds sees later changes. Stated assumption,
 * as for the rest of the fake: Discord's gateway updates (role changes) reach
 * the bot's caches before it next reads them. As in discord.js, a guild's
 * member cache holds only the members the bot fetched, who used a command or
 * were picked in one of its options.
 */
export class FakeViews {
  /** guildId → ids of the members discord.js has cached */
  private readonly memberCache = new Map<string, Set<string>>();

  constructor(private readonly world: FakeWorld) {}

  /** Caches a member, as discord.js does when they use a command. */
  cacheMember(guildId: string, userId: string): void {
    const cached = this.memberCache.get(guildId) ?? new Set<string>();
    cached.add(userId);
    this.memberCache.set(guildId, cached);
  }

  client(emitter: EventEmitter): Client {
    // getters on the literal need the views, not the literal they live on
    const views = this;
    return Object.assign(
      emitter,
      mockOf<Client>({
        isReady: () => this.world.gatewayConnected(),
        guilds: {
          get cache() {
            return views.guildCollection();
          },
          fetch: (guildId: string) => this.fetchGuild(guildId),
        },
        users: { fetch: (userId: string) => this.fetchUser(userId) },
        emojis: {
          get cache() {
            return views.emojiCollection();
          },
        },
      }),
    );
  }

  guild(guildId: string): Guild {
    const views = this;
    const members = {
      get cache() {
        return collectionOf(views.cachedMemberViews(guildId));
      },
      /**
       * Like GuildMemberManager.fetch: one member (10007 for a non-member),
       * the members among `{ user: ids }` (non-members are left out), or every
       * member; all of them are cached.
       */
      fetch: (options?: string | { user: readonly string[] }) => {
        if (options === undefined) {
          return Promise.resolve(collectionOf(this.fetchAllMembers(guildId)));
        }
        return typeof options === 'string'
          ? this.fetchMember(guildId, options)
          : this.fetchMembers(guildId, options.user);
      },
    };
    const roles = {
      /** Like RoleManager.cache: every role the guild has, @everyone included. */
      get cache() {
        return collectionOf(views.roleViews(guildId));
      },
      /** Like RoleManager.fetch in discord.js 14.27: null for a role the guild doesn't have. */
      fetch: (roleId: string) =>
        Promise.resolve(
          this.roleViews(guildId).find(({ id }) => id === roleId) ?? null,
        ),
    };
    const channels = {
      fetch: (channelId: string) => this.fetchChannel(guildId, channelId),
    };
    const emojis = {
      /** Like GuildEmojiManager.cache: the guild's own emojis. */
      get cache() {
        return views.emojiCollection(guildId);
      },
      /** Like GuildEmojiManager.fetch: an emoji of another guild, or none, is the API's 10014. */
      fetch: (emojiId: string) => {
        const emoji = views.emojiCollection(guildId).get(emojiId);
        return emoji
          ? Promise.resolve(emoji)
          : Promise.reject(
              unknownResource(
                RESTJSONErrorCodes.UnknownEmoji,
                `/guilds/${guildId}/emojis/${emojiId}`,
              ),
            );
      },
    };
    return mockOf<Guild>({ id: guildId, members, roles, channels, emojis });
  }

  user(userId: string): User {
    const user = this.world.user(userId);
    return mockOf<User>({
      id: userId,
      username: user?.username ?? userId,
      globalName: user?.globalName ?? null,
      // like discord.js's User.displayName; a guild nickname is the member's
      displayName: user?.globalName ?? user?.username ?? userId,
      bot: userId === BOT_USER_ID,
      partial: false,
      displayAvatarURL: () => avatarUrl(userId),
      createDM: () => Promise.resolve(this.dmChannel(userId)),
      send: (payload: OutgoingPayload) => this.sendDm(userId, payload),
    });
  }

  member(guildId: string, member: FakeMember): GuildMember {
    const user = this.user(member.id);
    const views = this;
    return mockOf<GuildMember>({
      id: member.id,
      displayName: member.displayName,
      user,
      permissions: member.permissions,
      displayAvatarURL: user.displayAvatarURL,
      get guild() {
        return views.guild(guildId);
      },
      roles: {
        /** Like GuildMemberRoleManager.cache: the member's roles, and @everyone. */
        get cache() {
          return collectionOf(
            views
              .roleViews(guildId)
              .filter(
                ({ id }) =>
                  id === views.everyone(guildId).id || member.roles.has(id),
              ),
          );
        },
        add: (roles: string | readonly string[]) =>
          typeof roles === 'string'
            ? this.changeRole(guildId, member, roles, 'PUT')
            : this.addRoles(guildId, member, roles),
        remove: (roles: string | readonly string[]) =>
          typeof roles === 'string'
            ? this.changeRole(guildId, member, roles, 'DELETE')
            : this.removeRoles(guildId, member, roles),
      },
    });
  }

  role(guildId: string, role: FakeRole): Role {
    const views = this;
    return mockOf<Role>({
      id: role.id,
      name: role.name,
      /** Like Role.editable: whether the bot may give or take it. */
      editable: role.aboveBot !== true,
      /** Like Role.members: the cached members holding it (all of them, for @everyone). */
      get members() {
        return collectionOf(
          views
            .cachedMemberViews(guildId)
            .filter(
              (member) =>
                role.id === guildId || member.roles.cache.has(role.id),
            ),
        );
      },
    });
  }

  channel(channel: FakeChannel): TextChannel {
    return mockOf<TextChannel>({
      id: channel.id,
      guildId: channel.guildId,
      name: channel.name,
      type: ChannelType.GuildText,
      isTextBased: () => true,
      isDMBased: () => false,
      send: (payload: OutgoingPayload) =>
        this.world.canPostIn(channel.id)
          ? Promise.try(() =>
              this.world.post(channel, payload).toMessage<true>(),
            )
          : Promise.reject(
              missingPermissions('POST', `/channels/${channel.id}/messages`),
            ),
      messages: {
        fetch: (messageId: string) => {
          const message = this.world.message(channel.id, messageId);
          return message
            ? Promise.resolve(message.toMessage<true>())
            : Promise.reject(
                unknownResource(
                  RESTJSONErrorCodes.UnknownMessage,
                  `/channels/${channel.id}/messages/${messageId}`,
                ),
              );
        },
      },
    });
  }

  // --- internals

  private everyone(guildId: string): FakeRole {
    return { id: guildId, name: '@everyone' };
  }

  private roleViews(guildId: string): Role[] {
    return [this.everyone(guildId), ...this.world.roles(guildId)].map((role) =>
      this.role(guildId, role),
    );
  }

  private memberViews(guildId: string): GuildMember[] {
    return this.world.members().map((member) => this.member(guildId, member));
  }

  private cachedMemberViews(guildId: string): GuildMember[] {
    const cached = this.memberCache.get(guildId);
    return this.memberViews(guildId).filter(({ id }) => cached?.has(id));
  }

  private fetchAllMembers(guildId: string): GuildMember[] {
    const members = this.memberViews(guildId);
    for (const { id } of members) this.cacheMember(guildId, id);
    return members;
  }

  private guildCollection(): Collection<string, Guild> {
    return collectionOf(this.world.guildIds().map((id) => this.guild(id)));
  }

  /** The emojis of `guildId`, or of every guild. */
  private emojiCollection(guildId?: string): Collection<string, GuildEmoji> {
    return new Collection(
      [...this.world.emojis()]
        .filter(
          ([, emoji]) => guildId === undefined || emoji.guildId === guildId,
        )
        .map(([id, { name }]) => [
          id,
          mockOf<GuildEmoji>({ id, name, toString: () => `<:${name}:${id}>` }),
        ]),
    );
  }

  private fetchGuild(guildId: string): Promise<Guild> {
    if (this.world.guildsUnavailable()) {
      return Promise.reject(discordUnavailable('GET', `/guilds/${guildId}`));
    }
    return this.world.guildIds().includes(guildId)
      ? Promise.resolve(this.guild(guildId))
      : Promise.reject(unknownGuild(guildId));
  }

  private fetchMember(guildId: string, userId: string): Promise<GuildMember> {
    const member = this.world.member(userId);
    if (member) this.cacheMember(guildId, userId);
    return member
      ? Promise.resolve(this.member(guildId, member))
      : Promise.reject(
          unknownResource(
            RESTJSONErrorCodes.UnknownMember,
            `/guilds/${guildId}/members/${userId}`,
          ),
        );
  }

  /** Like a Request Guild Members by `user_ids`, which returns at most 100 members. */
  private fetchMembers(
    guildId: string,
    userIds: readonly string[],
  ): Promise<Collection<string, GuildMember>> {
    if (userIds.length === 0 || userIds.length > 100) {
      return Promise.reject(
        new Error(
          `DiscordMock fetches 1 to at most 100 members by id, as Discord returns; got ${userIds.length}`,
        ),
      );
    }
    const members = userIds.flatMap((userId) => {
      const member = this.world.member(userId);
      if (member === undefined) return [];
      this.cacheMember(guildId, userId);
      return [this.member(guildId, member)];
    });
    return Promise.resolve(collectionOf(members));
  }

  private fetchUser(userId: string): Promise<User> {
    return userId === BOT_USER_ID || this.world.user(userId)
      ? Promise.resolve(this.user(userId))
      : Promise.reject(
          unknownResource(RESTJSONErrorCodes.UnknownUser, `/users/${userId}`),
        );
  }

  /**
   * Like GuildChannelManager.fetch: an unknown channel is a 404, and a
   * channel of another guild is discord.js's GuildChannelUnowned.
   */
  private fetchChannel(
    guildId: string,
    channelId: string,
  ): Promise<TextChannel> {
    const channel = this.world.channel(channelId);
    if (!channel) {
      return Promise.reject(
        unknownResource(
          RESTJSONErrorCodes.UnknownChannel,
          `/channels/${channelId}`,
        ),
      );
    }
    return channel.guildId === guildId
      ? Promise.resolve(this.channel(channel))
      : Promise.reject(discordjsError(DiscordjsErrorCodes.GuildChannelUnowned));
  }

  private dmChannel(userId: string): DMChannel {
    return mockOf<DMChannel>({
      id: `dm-${userId}`,
      send: (payload: OutgoingPayload | MessagePayload) =>
        this.sendDm(userId, payload),
    });
  }

  private sendDm(userId: string, payload: OutgoingPayload | MessagePayload) {
    if (payload instanceof MessagePayload) {
      return Promise.reject(
        new Error('DiscordMock does not support MessagePayload'),
      );
    }
    if (!this.world.canBeMessaged(userId)) {
      return Promise.reject(cannotMessageUser(`dm-${userId}`));
    }
    return Promise.try(() => this.world.dm(userId, payload).toMessage<false>());
  }

  /**
   * Adds or removes one role, as discord.js does through the API: a role the
   * guild doesn't have is a 404.
   */
  private changeRole(
    guildId: string,
    member: FakeMember,
    roleId: string,
    method: 'PUT' | 'DELETE',
  ): Promise<GuildMember> {
    if (!this.hasRole(guildId, roleId)) {
      return Promise.reject(
        unknownResource(
          RESTJSONErrorCodes.UnknownRole,
          `/guilds/${guildId}/members/${member.id}/roles/${roleId}`,
          method,
        ),
      );
    }
    if (this.isAboveBot(guildId, roleId)) {
      return Promise.reject(
        missingPermissions(
          method,
          `/guilds/${guildId}/members/${member.id}/roles/${roleId}`,
        ),
      );
    }
    if (method === 'PUT') member.roles.add(roleId);
    else member.roles.delete(roleId);
    return Promise.resolve(this.member(guildId, member));
  }

  /**
   * Sets the member's roles, as discord.js does to change several at once.
   * Changing a role above the bot's is refused like the API refuses it.
   */
  private setRoles(
    guildId: string,
    member: FakeMember,
    roleIds: readonly string[],
  ): Promise<GuildMember> {
    const changed = [
      ...[...member.roles].filter((roleId) => !roleIds.includes(roleId)),
      ...roleIds.filter((roleId) => !member.roles.has(roleId)),
    ];
    if (changed.some((roleId) => this.isAboveBot(guildId, roleId))) {
      return Promise.reject(
        missingPermissions('PATCH', `/guilds/${guildId}/members/${member.id}`),
      );
    }
    member.roles.clear();
    for (const roleId of roleIds) member.roles.add(roleId);
    return Promise.resolve(this.member(guildId, member));
  }

  /**
   * Adds several roles, which discord.js does by setting the member's roles.
   * What the API answers when that includes a role the guild lacks isn't
   * modelled, so it's refused.
   */
  private addRoles(
    guildId: string,
    member: FakeMember,
    roleIds: readonly string[],
  ): Promise<GuildMember> {
    const unknown = roleIds.filter((roleId) => !this.hasRole(guildId, roleId));
    if (unknown.length > 0) {
      return Promise.reject(
        new Error(
          `DiscordMock does not model setting roles guild ${guildId} lacks (${unknown.join(', ')})`,
        ),
      );
    }
    return this.setRoles(guildId, member, [
      ...new Set([...member.roles, ...roleIds]),
    ]);
  }

  /**
   * Removes several roles, as discord.js does: each role resolves against the
   * guild first and one the guild lacks throws DiscordjsTypeError, then the
   * member's roles are set to the rest. Roles the member doesn't hold are
   * simply skipped.
   */
  private removeRoles(
    guildId: string,
    member: FakeMember,
    roleIds: readonly string[],
  ): Promise<GuildMember> {
    const unknown = roleIds.find((roleId) => !this.hasRole(guildId, roleId));
    if (unknown !== undefined) {
      return Promise.reject(
        discordjsError(
          DiscordjsErrorCodes.InvalidElement,
          ['Array or Collection', 'roles', unknown],
          DiscordjsTypeError,
        ),
      );
    }
    return this.setRoles(
      guildId,
      member,
      [...member.roles].filter((roleId) => !roleIds.includes(roleId)),
    );
  }

  private isAboveBot(guildId: string, roleId: string): boolean {
    return this.world
      .roles(guildId)
      .some(({ id, aboveBot }) => id === roleId && aboveBot === true);
  }

  private hasRole(guildId: string, roleId: string): boolean {
    return this.world.roles(guildId).some(({ id }) => id === roleId);
  }
}

/** Guild permissions for a member, from what the test grants them. */
export const permissionsOf = (
  granted: ConstructorParameters<typeof PermissionsBitField>[0],
) => new PermissionsBitField(granted).freeze();
