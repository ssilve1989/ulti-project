import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { UnhandledExceptionBus } from '@nestjs/cqrs';
import { Subscription } from 'rxjs';
import { sentryReport } from './sentry/sentry.consts.js';

@Injectable()
class AppService implements OnApplicationShutdown {
  private readonly subscription: Subscription;
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly unhandledExceptionBus: UnhandledExceptionBus) {
    this.subscription = this.unhandledExceptionBus.subscribe({
      // TODO: The logger doesn't log unhandledExceptionInfo correctly if given the entire object
      next: ({ exception }) => {
        sentryReport(exception);
        this.logger.error(exception);
      },
    });
  }

  onApplicationShutdown(): void {
    this.subscription.unsubscribe();
  }
}

export { AppService };
