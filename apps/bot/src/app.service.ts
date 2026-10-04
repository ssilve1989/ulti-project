import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { UnhandledExceptionBus } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { Subscription } from 'rxjs';
import { ErrorService } from './error/error.service.js';

@Injectable()
class AppService implements OnApplicationShutdown {
  private readonly subscription: Subscription;

  constructor(
    private readonly unhandledExceptionBus: UnhandledExceptionBus,
    private readonly errorService: ErrorService,
  ) {
    this.subscription = this.unhandledExceptionBus.subscribe({
      // TODO: The logger doesn't log unhandledExceptionInfo correctly if given the entire object
      next: ({ cause, exception }) => {
        // withScope forks the current scope, which is still the one of the
        // command or reaction that published the event, so the report keeps
        // its trace, tags and user without the cause leaking back into it
        Sentry.withScope((scope) => {
          scope.setExtra('cause', cause);
          this.errorService.captureError(exception);
        });
      },
    });
  }

  onApplicationShutdown(): void {
    this.subscription.unsubscribe();
  }
}

export { AppService };
