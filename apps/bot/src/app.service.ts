import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { UnhandledExceptionBus } from '@nestjs/cqrs';
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
      next: ({ exception }) => {
        this.errorService.captureError(exception);
      },
    });
  }

  onApplicationShutdown(): void {
    this.subscription.unsubscribe();
  }
}

export { AppService };
