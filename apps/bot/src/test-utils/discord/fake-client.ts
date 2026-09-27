import type { EventEmitter } from 'node:events';
import {
  ChannelType,
  type Client,
  Collection,
  DiscordjsErrorCodes,
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
  type FakeMessage,
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
}

/** A guild text channel, the only kind the app uses. */
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
  readonly emojis: () => ReadonlyMap<string, string>;
  readonly canBeMessaged: (userId: string) => boolean;
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
 * as for the rest of the fake: Discord's gateway updates (role changes, the
 * member list) reach the bot's caches before it next reads them.
 */
export class FakeViews {
  constructor(private readonly world: FakeWorld) {}

  client(emitter: EventEmitter): Client {
    // getters on the literal need the views, not the literal they live on
    const views = this;
    return Object.assign(
      emitter,
      mockOf<Client>({
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
        return collectionOf(views.memberViews(guildId));
      },
      /** Like GuildMemberManager.fetch: one member (10007 for a non-member), or every member. */
      fetch: (userId?: string) =>
        userId === undefined
          ? Promise.resolve(collectionOf(this.memberViews(guildId)))
          : this.fetchMember(guildId, userId),
    };
    const roles = {
      get cache() {
        return collectionOf(views.roleViews(guildId));
      },
      get everyone() {
        return views.role(guildId, views.everyone(guildId));
      },
      /** Like RoleManager.fetch in discord.js 14.27: null for a role the guild doesn't have. */
      fetch: (roleId?: string) =>
        Promise.resolve(
          roleId === undefined
            ? collectionOf(this.roleViews(guildId))
            : (this.roleViews(guildId).find(({ id }) => id === roleId) ?? null),
        ),
    };
    const channels = {
      fetch: (channelId: string) => this.fetchChannel(guildId, channelId),
    };
    return mockOf<Guild>({ id: guildId, members, roles, channels });
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
          this.changeRoles(guildId, roles, (roleId) =>
            member.roles.add(roleId),
          ),
        remove: (roles: string | readonly string[]) =>
          this.changeRoles(guildId, roles, (roleId) =>
            member.roles.delete(roleId),
          ),
      },
    });
  }

  role(guildId: string, role: FakeRole): Role {
    const views = this;
    return mockOf<Role>({
      id: role.id,
      name: role.name,
      /** Like Role.members: the guild's members holding it (every member, for @everyone). */
      get members() {
        return collectionOf(
          views
            .memberViews(guildId)
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
      send: (payload: OutgoingPayload) =>
        Promise.try(() => this.world.post(channel, payload).toMessage<true>()),
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

  private guildCollection(): Collection<string, Guild> {
    return collectionOf(this.world.guildIds().map((id) => this.guild(id)));
  }

  private emojiCollection(): Collection<string, GuildEmoji> {
    return new Collection(
      [...this.world.emojis()].map(([id, name]) => [
        id,
        mockOf<GuildEmoji>({ id, name, toString: () => `<:${name}:${id}>` }),
      ]),
    );
  }

  private fetchGuild(guildId: string): Promise<Guild> {
    return this.world.guildIds().includes(guildId)
      ? Promise.resolve(this.guild(guildId))
      : Promise.reject(unknownGuild(guildId));
  }

  private fetchMember(guildId: string, userId: string): Promise<GuildMember> {
    const member = this.world.member(userId);
    return member
      ? Promise.resolve(this.member(guildId, member))
      : Promise.reject(
          unknownResource(
            RESTJSONErrorCodes.UnknownMember,
            `/guilds/${guildId}/members/${userId}`,
          ),
        );
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
   * Adds or removes roles the guild has; a role it doesn't have is refused,
   * as the API refuses it.
   */
  private changeRoles(
    guildId: string,
    roles: string | readonly string[],
    apply: (roleId: string) => void,
  ): Promise<void> {
    const known = new Set(this.world.roles(guildId).map(({ id }) => id));
    const unknown = [roles].flat().filter((roleId) => !known.has(roleId));
    if (unknown.length > 0) {
      return Promise.reject(
        new Error(
          `Guild ${guildId} has no role ${unknown.join(', ')}; DiscordMock refuses what the API would reject`,
        ),
      );
    }
    for (const roleId of [roles].flat()) apply(roleId);
    return Promise.resolve();
  }
}

/** Guild permissions for a member, from what the test grants them. */
export const permissionsOf = (
  granted: ConstructorParameters<typeof PermissionsBitField>[0],
) => new PermissionsBitField(granted).freeze();
