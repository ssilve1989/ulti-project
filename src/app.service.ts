import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { UnhandledExceptionBus } from '@nestjs/cqrs';
import { Subject, takeUntil } from 'rxjs';

@Injectable()
class AppService implements OnModuleDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly unhandledExceptionBus: UnhandledExceptionBus) {
    this.unhandledExceptionBus.pipe(takeUntil(this.destroy$)).subscribe({
      next: (exceptionInfo) => this.logger.error(exceptionInfo),
    });
  }

  onModuleDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

export { AppService };
