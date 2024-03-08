import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, DMChannel, Guild } from 'discord.js';
import { AppConfig } from '../app.config.js';
import { InjectDiscordClient } from './discord.decorators.js';

// TODO: This should be agnostic to a specfic discord server and work with all servers its part of
@Injectable()
class DiscordService implements OnApplicationBootstrap {
  private server: Guild;

  constructor(
    @InjectDiscordClient() public readonly client: Client,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async onApplicationBootstrap() {
    const guildId = this.configService.get<string>('GUILD_ID');
    this.server = await this.client.guilds.fetch(guildId);
  }

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

  public async getTextChannel(channelId: string) {
    const channel = await this.server.channels.fetch(channelId);
    return channel?.isTextBased() ? channel : null;
  }

  /**
   * returns the users display name for the ulti-project server
   * @param userId
   * @returns
   */
  public async getDisplayName(userId: string) {
    const member = await this.server.members.fetch(userId);
    return member.displayName;
  }

  public async userHasRole(userId: string, roleId: string) {
    const member = await this.server.members.fetch(userId);
    return member.roles.cache.has(roleId);
  }
}

export { DiscordService };
