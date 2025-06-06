import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { betterAuth } from 'better-auth';
import type { AppConfig } from '../../app.config.js';
import { getBetterAuthConfig } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { BETTER_AUTH_INSTANCE_TOKEN } from './auth.decorators.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [
    {
      provide: BETTER_AUTH_INSTANCE_TOKEN,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        betterAuth(
          getBetterAuthConfig({
            clientId: configService.get('CLIENT_ID'),
            clientSecret: configService.get('DISCORD_OAUTH_TOKEN'),
            betterAuthSecret: configService.get('BETTER_AUTH_SECRET'),
            baseURL: configService.get('BETTER_AUTH_BASE_URL'),
          }),
        ),
    },
    AuthService,
  ],
  exports: [AuthService, BETTER_AUTH_INSTANCE_TOKEN],
})
export class AuthModule {}
