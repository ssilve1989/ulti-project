import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as clack from '@clack/prompts';
import type { Command } from 'commander';
import type { Firestore } from 'firebase-admin/firestore';
import type { EncounterDocument } from '../../../../firebase/models/encounter.model.js';
import { ctx } from '../../../config.js';
import { cancelIfCancel } from '../../../utils/clack.js';
import {
  type EncounterYamlConfig,
  readEncounterYaml,
} from '../../../utils/encounter-yaml.js';
import {
  addProgPoint,
  clearProgPoints,
  upsertEncounter,
} from '../../../utils/firestore.js';

export interface PushCommandOptions {
  dryRun?: boolean;
  yes?: boolean;
}

function getEncounterYamlPaths(encounterId?: string): string[] {
  const dir = join(process.cwd(), 'data', 'encounters');
  if (encounterId) {
    return [join(dir, `${encounterId}.yaml`)];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => join(dir, f));
}

async function pushEncounter(
  db: Firestore,
  config: EncounterYamlConfig,
): Promise<void> {
  const encounterData: Partial<EncounterDocument> = {
    name: config.name,
    description: config.description,
    active: config.active,
    ...(config.mode !== undefined && { mode: config.mode }),
    ...(config.emoji !== undefined && { emoji: config.emoji }),
    ...(config.fflogsEncounterIds !== undefined && {
      fflogsEncounterIds: config.fflogsEncounterIds,
    }),
    ...(config.progPartyThreshold !== undefined && {
      progPartyThreshold: config.progPartyThreshold,
    }),
    ...(config.clearPartyThreshold !== undefined && {
      clearPartyThreshold: config.clearPartyThreshold,
    }),
  };

  await upsertEncounter(db, config.id, encounterData);
  await clearProgPoints(db, config.id);

  const progPoints = config.progPoints ?? [];
  for (const [i, pp] of progPoints.entries()) {
    await addProgPoint(db, config.id, { ...pp, order: i });
  }
}

async function pushWithConfirmation(
  db: Firestore,
  config: EncounterYamlConfig,
  yes: boolean | undefined,
): Promise<boolean> {
  if (!yes) {
    const confirmed = cancelIfCancel(
      await clack.confirm({ message: `Push ${config.id} to Firestore?` }),
    );
    if (!confirmed) {
      clack.log.info(`Skipped ${config.id}`);
      return false;
    }
  }

  const spinner = clack.spinner();
  spinner.start(`Pushing ${config.id}...`);

  try {
    await pushEncounter(db, config);
    const count = config.progPoints?.length ?? 0;
    spinner.stop(`Pushed ${config.id} (${count} prog points)`);
    return true;
  } catch (error) {
    spinner.stop('Failed');
    clack.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export async function runPush(
  db: Firestore,
  encounterId: string | undefined,
  opts: PushCommandOptions,
): Promise<void> {
  clack.intro('Push Encounters');

  let configs: EncounterYamlConfig[];

  const readSpinner = clack.spinner();
  readSpinner.start('Reading YAML files...');

  try {
    const paths = getEncounterYamlPaths(encounterId);
    configs = paths.map((p) => readEncounterYaml(p));
    readSpinner.stop(`Loaded ${configs.length} encounter file(s)`);
  } catch (error) {
    readSpinner.stop('Failed');
    clack.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (opts.dryRun) {
    for (const config of configs) {
      const count = config.progPoints?.length ?? 0;
      clack.log.info(`Would push: ${config.id} (${count} prog points)`);
    }
    clack.outro('Dry-run complete — no changes applied.');
    return;
  }

  let pushed = 0;

  for (const config of configs) {
    const didPush = await pushWithConfirmation(db, config, opts.yes);
    if (didPush) pushed++;
  }

  clack.outro(`Done — pushed ${pushed} of ${configs.length} encounter(s).`);
}

export function registerPushCommand(encountersCmd: Command): void {
  encountersCmd
    .command('push [encounter-id]')
    .description('Push encounter YAML files to Firestore')
    .option('--dry-run', 'Print planned changes without applying')
    .option('--yes', 'Skip confirmation prompts')
    .action(
      async (encounterId: string | undefined, opts: PushCommandOptions) => {
        await runPush(ctx.db, encounterId, opts);
      },
    );
}
