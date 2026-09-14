import * as clack from '@clack/prompts';

function isCancel(value: unknown): value is symbol {
  return clack.isCancel(value);
}

export function cancelIfCancel<T>(value: T | symbol): T {
  if (isCancel(value)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return value;
}
