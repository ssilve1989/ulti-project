import {
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import type { AppConfig } from '../app.config.js';

@Module({
  imports: [ConfigModule],
})
export class SentryModule implements OnModuleInit, OnApplicationShutdown {
  constructor(private readonly configService: ConfigService<AppConfig>) {}

  onModuleInit() {
    Sentry.init({
      integrations: [nodeProfilingIntegration()],
      // Performance Monitoring
      tracesSampleRate: 1.0, //  Capture 100% of the transactions
      // Set sampling rate for profiling - this is relative to tracesSampleRate
      profilesSampleRate: 1.0,
      environment: this.configService.get('NODE_ENV'),
    });
  }

  async onApplicationShutdown() {
    await Sentry.close(2000);
  }
}
