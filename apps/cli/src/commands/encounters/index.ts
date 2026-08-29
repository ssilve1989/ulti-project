import type { Command } from 'commander';
import { registerAddCommand } from './add/index.ts';
import { registerPullCommand } from './pull/index.ts';
import { registerPushCommand } from './push/index.ts';
import { registerViewCommand } from './view/index.ts';

export function registerEncountersCommand(program: Command): void {
  const encountersCmd = program
    .command('encounters')
    .description('Manage encounters');

  registerAddCommand(encountersCmd);
  registerPullCommand(encountersCmd);
  registerPushCommand(encountersCmd);
  registerViewCommand(encountersCmd);
}
