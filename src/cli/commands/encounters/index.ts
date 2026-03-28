import type { Command } from 'commander';
import { registerAddCommand } from './add/index.js';
import { registerManageProgPointsCommand } from './manage-prog-points/index.js';
import { registerPullCommand } from './pull/index.js';
import { registerPushCommand } from './push/index.js';
import { registerViewCommand } from './view/index.js';

export function registerEncountersCommand(program: Command): void {
  const encountersCmd = program
    .command('encounters')
    .description('Manage encounters');

  registerAddCommand(encountersCmd);
  registerManageProgPointsCommand(encountersCmd);
  registerPullCommand(encountersCmd);
  registerPushCommand(encountersCmd);
  registerViewCommand(encountersCmd);
}
