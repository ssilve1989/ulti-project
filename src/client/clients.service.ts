import { Injectable } from '@nestjs/common';
import { InjectDiscordClient } from './client.decorators.js';
import { Client } from 'discord.js';

@Injectable()
class ClientsService {
  constructor(@InjectDiscordClient() private readonly client: Client) {}

  public async sendDirectMessage(userId: string, message: string) {
    const user = await this.client.users.fetch(userId);
    const dm = await user.createDM();
    return dm.send(message);
  }
}

export { ClientsService };
