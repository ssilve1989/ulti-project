import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDiscordClient } from './discord.decorators.js';
import { Client, Guild } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../app.config.js';

@Injectable()
class DiscordService implements OnApplicationBootstrap {
  private server: Guild;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    @InjectDiscordClient() private readonly client: Client,
  ) {}

  async onApplicationBootstrap() {
    const guildId = this.configService.get<string>('GUILD_ID');
    this.server = await this.client.guilds.fetch(guildId);
  }

  public async sendDirectMessage(userId: string, message: string) {
    const user = await this.client.users.fetch(userId);
    const dm = await user.createDM();
    return dm.send(message);
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
}

export { DiscordService };
