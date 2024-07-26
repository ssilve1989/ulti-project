import { startSpan } from '@sentry/node';

/**
 * A decorator usable to wrap arbitrary functions with spans.
 */
export function SentryTraced(op = 'function') {
  return (_: unknown, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value as (
      ...args: any[]
    ) => Promise<any> | any; // function can be sync or async

    descriptor.value = function (...args: any[]) {
      return startSpan(
        {
          op: op,
          name: propertyKey,
        },
        () => {
          return originalMethod.apply(this, args);
        },
      );
    };
    return descriptor;
  };
}
