import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import {
  Client,
  DMChannel,
  DiscordAPIError,
  GuildEmoji,
  type GuildMember,
} from 'discord.js';
import { from, lastValueFrom, mergeMap } from 'rxjs';
import { InjectDiscordClient } from './discord.decorators.js';

@Injectable()
class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  constructor(@InjectDiscordClient() public readonly client: Client) {}

  public getGuilds(): string[] {
    return this.client.guilds.cache.map((guild) => guild.id);
  }

  public async getGuildMember({
    memberId,
    guildId,
  }: { memberId: string; guildId: string }): Promise<GuildMember | undefined> {
    try {
      const member = await this.client.guilds.cache
        .get(guildId)
        ?.members.fetch(memberId);
      return member;
    } catch (error) {
      // Unknown Member error
      if (error instanceof DiscordAPIError && error.code === 10007) {
        Sentry.getCurrentScope().captureMessage(error.message, 'debug');
        return undefined;
      }
      throw error;
    }
  }

  public async sendDirectMessage(
    userId: string,
    message: Parameters<DMChannel['send']>[0],
  ) {
    const user = await this.client.users.fetch(userId);
    const dm = await user.createDM();
    return dm.send(message);
  }

  public async getTextChannel({
    guildId,
    channelId,
  }: { guildId: string; channelId: string }) {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    return channel?.isTextBased() ? channel : null;
  }

  /**
   * returns the users display name for the ulti-project server
   * @param userId
   * @returns
   */
  public async getDisplayName({
    userId,
    guildId,
  }: { guildId: string; userId: string }) {
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    return member.displayName;
  }

  public async userHasRole({
    userId,
    guildId,
    roleId,
  }: { guildId: string; userId: string; roleId: string }) {
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    return member.roles.cache.has(roleId);
  }

  public getEmojiString(emojiId: string) {
    const hasEmoji = this.client.emojis.cache.has(emojiId);
    return hasEmoji ? `<:_:${emojiId}>` : '';
  }

  public async getEmojis(emojiNames: string[]) {
    return emojiNames.reduce((emojis, name) => {
      const emoji = this.client.emojis.cache.find((e) => e.name === name);
      if (emoji) {
        emojis.push(emoji);
      }
      return emojis;
    }, [] as GuildEmoji[]);
  }

  public async deleteMessage(
    guildId: string,
    channelId: string,
    messageId: string,
  ) {
    const channel = await this.getTextChannel({ guildId, channelId });
    const message = await channel?.messages.fetch(messageId);
    return message?.delete();
  }

  /**
   * Removes the role from all members in the guild
   * @param roleId
   */
  public async removeRole(guildId: string, roleId: string) {
    const guild = await this.client.guilds.fetch(guildId);
    // we need to update the cache of guild members because `roles.members` only returns currently cached members
    await guild.members.fetch();

    const role = await guild.roles.fetch(roleId);

    if (!role) {
      this.logger.warn(`role ${roleId} not found in guild ${guildId}`);
      return 0;
    }

    const { members } = role;

    this.logger.log(`found ${members.size} members with role ${role.name}`);

    const task$ = from(members.values()).pipe(
      mergeMap(
        (member) =>
          member.roles.remove(roleId).catch((err) => {
            Sentry.captureException(err);
            this.logger.error(
              `failed to remove role ${role.name} from member ${member.displayName}`,
            );
          }),
        50,
      ),
    );

    await lastValueFrom(task$, { defaultValue: undefined });
    return members.size;
  }

  /**
   * Retires a role by removing it from all members and adding a new role
   * @param guildId The ID of the guild
   * @param fromRoleId The ID of the role to be removed
   * @param toRoleId The ID of the role to be added
   * @returns Object with statistics about the operation
   */
  public async retireRole(
    guildId: string,
    fromRoleId: string,
    toRoleId: string,
  ) {
    const guild = await this.client.guilds.fetch(guildId);
    await guild.members.fetch(); // Make sure our cache is up-to-date
    const role = await guild.roles.fetch(fromRoleId);

    if (!role) {
      this.logger.warn(`Role ${fromRoleId} not found in guild ${guildId}`);
      return {
        totalMembers: 0,
        successCount: 0,
        failCount: 0,
      };
    }

    const totalMembers = role.members.size;
    let successCount = 0;
    let failCount = 0;

    if (totalMembers === 0) {
      return {
        totalMembers,
        successCount,
        failCount,
      };
    }

    const task$ = from(role.members.values()).pipe(
      // Process 5 role removals and additions concurrently
      mergeMap(async (member) => {
        try {
          await member.roles.remove(fromRoleId);
          await member.roles.add(toRoleId);
          successCount++;
          return { success: true };
        } catch (error) {
          this.logger.error(
            `Failed to update roles for member ${member.user.username}`,
            error,
          );
          failCount++;
          return { success: false };
        }
      }, 5),
    );

    // Wait for all operations to complete
    await lastValueFrom(task$, { defaultValue: undefined });

    return {
      totalMembers,
      successCount,
      failCount,
    };
  }

  public async getGuildInvites(guildId: string) {
    const guild = await this.client.guilds.fetch(guildId);
    return guild.invites.fetch();
  }
}

export { DiscordService };
