import { Injectable } from '@nestjs/common';
import { Client, DMChannel } from 'discord.js';
import { InjectDiscordClient } from './discord.decorators.js';
import {
  DiscordChannelRequestOptions,
  DiscordUserRequestOptions,
} from './discord.interfaces.js';

@Injectable()
class DiscordService {
  constructor(@InjectDiscordClient() public readonly client: Client) {}

  public async getGuildMember(memberId: string, guildId: string) {
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
  }: DiscordChannelRequestOptions) {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    return channel?.isTextBased() ? channel : null;
  }

  /**
   * returns the users display name for the ulti-project server
   * @param userId
   * @returns
   */
  public async getDisplayName({ userId, guildId }: DiscordUserRequestOptions) {
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    return member.displayName;
  }

  public async userHasRole({
    userId,
    guildId,
    roleId,
  }: DiscordUserRequestOptions & { roleId: string }) {
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    return member.roles.cache.has(roleId);
  }

  public async removeRole({
    userId,
    guildId,
    roleId,
  }: DiscordUserRequestOptions & { roleId: string }) {
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.roles.remove(roleId);
  }
}

export { DiscordService };
