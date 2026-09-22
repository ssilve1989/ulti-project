import * as clack from '@clack/prompts';

function isCancel(value: unknown): value is typeof clack.CANCEL_SYMBOL {
  return clack.isCancel(value);
}

export function cancelIfCancel<T>(value: T | typeof clack.CANCEL_SYMBOL): T {
  if (isCancel(value)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return value;
}
