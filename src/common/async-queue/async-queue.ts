import { Subject, concatMap } from 'rxjs';

interface Job<T> {
  task: (...args: any[]) => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
}

/**
 * A queue that runs tasks asynchronously in the order they are added.
 * Note: This is an extremely naive implementation and should not be used beyond very basic use cases.
 * It has no additional features such as concurrency limits, error handling, or task cancellation, overflow tracking, etc.
 */
class AsyncQueue {
  private readonly queue$ = new Subject<Job<unknown>>();

  constructor() {
    this.queue$
      .pipe(
        concatMap(async ({ task, resolve, reject }) => {
          try {
            const result = await task();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }),
      )
      .subscribe();
  }

  public add<T>(task: (...args: any[]) => Promise<T>) {
    return new Promise((resolve, reject) => {
      this.queue$.next({ task, resolve, reject });
    });
  }
}

export { AsyncQueue };
