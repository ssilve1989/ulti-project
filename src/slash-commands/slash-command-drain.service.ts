import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

const SHUTDOWN_DRAIN_TIMEOUT_MS = 25_000;

@Injectable()
class SlashCommandDrainService implements OnModuleDestroy {
  private readonly logger = new Logger(SlashCommandDrainService.name);
  private draining = false;
  private readonly inFlight = new Set<Promise<unknown>>();

  isDraining(): boolean {
    return this.draining;
  }

  track<T>(promise: Promise<T>): Promise<T> {
    this.inFlight.add(promise);
    const untrack = () => this.inFlight.delete(promise);
    promise.then(untrack, untrack);
    return promise;
  }

  async onModuleDestroy(): Promise<void> {
    this.draining = true;

    if (this.inFlight.size === 0) {
      return;
    }

    this.logger.log(
      `Draining ${this.inFlight.size} in-flight slash command(s)...`,
    );

    const drained = Promise.allSettled([...this.inFlight]).then(
      () => true as const,
    );

    let timerId: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<false>((resolve) => {
      timerId = setTimeout(() => resolve(false), SHUTDOWN_DRAIN_TIMEOUT_MS);
    });

    const finishedInTime = await Promise.race([drained, timedOut]);
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }

    if (!finishedInTime) {
      this.logger.warn(
        `Shutdown drain timed out after ${SHUTDOWN_DRAIN_TIMEOUT_MS}ms with ${this.inFlight.size} command(s) still in flight`,
      );
    }
  }
}

export { SHUTDOWN_DRAIN_TIMEOUT_MS, SlashCommandDrainService };
