import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Client } from 'discord.js';
import { InjectDiscordClient } from '../discord/discord.decorators.js';

// Fly's health checks must never be throttled
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@InjectDiscordClient() private readonly client: Client) {}

  @Get()
  health(): { status: 'ok'; discord: boolean } {
    return { status: 'ok', discord: this.client.isReady() };
  }
}
