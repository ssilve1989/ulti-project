import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Client, DMChannel, GuildEmoji } from 'discord.js';
import { from, lastValueFrom, mergeMap } from 'rxjs';
import { InjectDiscordClient } from './discord.decorators.js';

@Injectable()
class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  constructor(@InjectDiscordClient() public readonly client: Client) {}

  public async getGuildMember({
    memberId,
    guildId,
  }: { memberId: string; guildId: string }) {
    const member = await this.client.guilds.cache
      .get(guildId)
      ?.members.fetch(memberId);
    return member;
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
}

export { DiscordService };
