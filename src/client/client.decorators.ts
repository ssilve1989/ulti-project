import { Inject } from '@nestjs/common';

export const DISCORD_CLIENT = '@discord/client';

export const InjectDiscordClient = () => Inject(DISCORD_CLIENT);
