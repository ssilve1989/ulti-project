import type { Command } from 'commander';
import type { CliContext } from '../../config.js';
import { registerAddCommand } from './add/index.js';
import { registerManageProgPointsCommand } from './manage-prog-points/index.js';
import { registerViewCommand } from './view/index.js';

export function registerEncountersCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  const encountersCmd = program
    .command('encounters')
    .description('Manage encounters');

  registerAddCommand(encountersCmd, getCtx);
  registerManageProgPointsCommand(encountersCmd, getCtx);
  registerViewCommand(encountersCmd, getCtx);
}
