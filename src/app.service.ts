import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { UnhandledExceptionBus } from '@nestjs/cqrs';
import { Subject, takeUntil } from 'rxjs';

@Injectable()
class AppService implements OnModuleDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly unhandledExceptionBus: UnhandledExceptionBus) {
    this.unhandledExceptionBus.pipe(takeUntil(this.destroy$)).subscribe({
      // TODO: The logger doesn't log unhandledExceptionInfo correctly if given the entire object
      next: ({ exception }) => this.logger.error(exception),
    });
  }

  onModuleDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

export { AppService };
