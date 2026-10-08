import { Controller, Get } from '@nestjs/common';
import { Client } from 'discord.js';
import { InjectDiscordClient } from '../discord/discord.decorators.js';

@Controller('health')
export class HealthController {
  constructor(@InjectDiscordClient() private readonly client: Client) {}

  @Get()
  health(): { status: 'ok'; discord: boolean } {
    return { status: 'ok', discord: this.client.isReady() };
  }
}
