import * as clack from '@clack/prompts';
import type { Command } from 'commander';
import type { Firestore } from 'firebase-admin/firestore';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { ctx } from '../../../config.js';
import { cancelIfCancel } from '../../../utils/clack.js';
import { dispatchAction } from './handlers.js';

export async function runManageProgPoints(db: Firestore): Promise<void> {
  clack.intro('Manage Prog Points');

  const encounterId = cancelIfCancel(
    await clack.select({
      message: 'Select encounter:',
      options: Object.values(Encounter).map((v) => ({ value: v, label: v })),
    }),
  );

  for (;;) {
    const action = cancelIfCancel(
      await clack.select({
        message: 'What would you like to do?',
        options: [
          { value: 'add', label: 'Add prog point' },
          { value: 'edit', label: 'Edit prog point' },
          { value: 'toggle', label: 'Toggle active/inactive' },
          { value: 'delete', label: 'Delete prog point' },
          { value: 'reorder', label: 'Reorder prog points' },
          { value: 'exit', label: 'Exit' },
        ],
      }),
    );

    if (action === 'exit') break;

    try {
      await dispatchAction(db, encounterId, action);
    } catch (error) {
      clack.log.error(error instanceof Error ? error.message : String(error));
    }
  }

  clack.outro('Done');
}

export function registerManageProgPointsCommand(encountersCmd: Command): void {
  encountersCmd
    .command('manage-prog-points')
    .description('Manage prog points for an encounter')
    .action(async () => {
      await runManageProgPoints(ctx.db);
    });
}
