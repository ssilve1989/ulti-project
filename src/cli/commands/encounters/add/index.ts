import * as clack from '@clack/prompts';
import type { Command } from 'commander';
import type { Firestore } from 'firebase-admin/firestore';
import { ctx } from '../../../config.js';
import {
  applySourceEditsStep,
  buildSourceEdits,
  loadOrBuildConfig,
  planSourceEdits,
  resolveUltimateCascade,
  seedFirestoreStep,
} from './steps.js';

export interface AddCommandOptions {
  config?: string;
  dryRun?: boolean;
  yes?: boolean;
  fflogsEncounterId?: string;
}

export async function runAdd(
  db: Firestore,
  fflogsToken: string | undefined,
  opts: AddCommandOptions,
): Promise<void> {
  clack.intro('Add New Encounter');

  const config = await loadOrBuildConfig(fflogsToken, opts);
  const ultimateToFlip = await resolveUltimateCascade(config);

  const sourceEdits = buildSourceEdits(config, ultimateToFlip);
  const changes = planSourceEdits(sourceEdits);

  clack.log.info('Planned source file changes:');
  for (const change of changes) {
    clack.log.message(`  ${change.file}\n    ${change.description}`);
  }

  if (opts.dryRun) {
    clack.log.info(
      'Firestore: would create encounter document + prog points (dry-run)',
    );
    clack.outro('Dry-run complete — no changes applied.');
    return;
  }

  await applySourceEditsStep(sourceEdits, opts);
  await seedFirestoreStep(db, config, opts);

  clack.outro(`Encounter '${config.id}' added successfully.`);
}

export function registerAddCommand(encountersCmd: Command): void {
  encountersCmd
    .command('add')
    .description('Add a new encounter (interactive or --config)')
    .option('--config <path>', 'Load encounter from YAML/JSON file')
    .option('--dry-run', 'Print planned changes without applying')
    .option('--yes', 'Skip confirmation prompts')
    .option(
      '--fflogs-encounter-id <ids>',
      'Comma-separated FF Logs encounter IDs',
    )
    .action(async (opts: AddCommandOptions) => {
      await runAdd(ctx.db, ctx.fflogsToken, opts);
    });
}
