import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import type { ProgPointDocument } from '../../../../firebase/models/encounter.model.js';
import { cancelIfCancel } from '../../../utils/clack.js';
import type { EncounterConfig } from '../../../utils/config-loader.js';
import { loadEncounterConfig } from '../../../utils/config-loader.js';
import {
  addProgPoint,
  getEncounter,
  upsertEncounter,
} from '../../../utils/firestore.js';
import {
  applySourceEdits,
  detectCurrentUltimates,
  type EncounterSourceEdits,
  planSourceEdits,
  readEncountersConsts,
} from '../../../utils/source-editor.js';
import type { AddCommandOptions } from './index.js';
import { buildConfigFromPrompts } from './prompts.js';

export function buildSourceEdits(
  config: EncounterConfig,
  ultimateToFlip?: string,
): EncounterSourceEdits {
  return {
    id: config.id,
    value: config.id,
    name: config.name,
    description: config.description,
    mode: config.mode,
    emoji: config.emoji,
    fflogsIds: config.fflogsEncounterIds,
    ultimateToFlip,
  };
}

export async function loadOrBuildConfig(
  fflogsToken: string | undefined,
  opts: AddCommandOptions,
): Promise<EncounterConfig> {
  if (!opts.config) {
    return await buildConfigFromPrompts(fflogsToken, opts);
  }
  const spinner = clack.spinner();
  spinner.start(`Loading config from ${opts.config}...`);
  try {
    const config = loadEncounterConfig(opts.config);
    spinner.stop(`Config loaded: ${config.id}`);
    return config;
  } catch (error) {
    spinner.stop('Failed to load config');
    clack.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export async function resolveUltimateCascade(
  config: EncounterConfig,
): Promise<string | undefined> {
  if (config.mode !== 'ultimate') return undefined;

  const source = readEncountersConsts();
  const currentUltimates = detectCurrentUltimates(source);

  if (currentUltimates.length > 1) {
    clack.log.error(
      `Found multiple encounters with mode 'ultimate': ${currentUltimates.join(', ')}. Fix this manually before proceeding.`,
    );
    process.exit(1);
  }

  if (currentUltimates.length === 0) return undefined;

  const existing = currentUltimates[0];
  clack.log.warn(`'${existing}' is currently mode: ultimate.`);
  const flip = cancelIfCancel(
    await clack.confirm({ message: `Move '${existing}' to legacy?` }),
  );
  if (!flip) {
    clack.cancel('Aborted — existing ultimate not moved.');
    process.exit(0);
  }
  return existing;
}

export async function applySourceEditsStep(
  sourceEdits: EncounterSourceEdits,
  opts: AddCommandOptions,
): Promise<void> {
  const apply = opts.yes
    ? true
    : cancelIfCancel(
        await clack.confirm({ message: 'Apply source file changes?' }),
      );
  if (!apply) return;

  const spinner = clack.spinner();
  spinner.start('Editing source files...');
  try {
    applySourceEdits(sourceEdits);
    spinner.stop('Source files updated');
  } catch (error) {
    spinner.stop('Failed');
    clack.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function seedProgPoints(
  db: Firestore,
  config: EncounterConfig,
): Promise<void> {
  if (!config.progPoints || config.progPoints.length === 0) return;

  const ppSpinner = clack.spinner();
  ppSpinner.start(`Adding ${config.progPoints.length} prog points...`);
  let addedCount = 0;
  try {
    for (let i = 0; i < config.progPoints.length; i++) {
      const pp = config.progPoints[i];
      const progPoint: ProgPointDocument = {
        id: pp.id,
        label: pp.label,
        partyStatus: pp.partyStatus,
        order: i,
        active: true,
      };
      await addProgPoint(db, config.id, progPoint);
      addedCount++;
    }
    ppSpinner.stop(`Added ${addedCount} prog points`);
  } catch (error) {
    ppSpinner.stop(
      `Failed after ${addedCount}/${config.progPoints.length} prog points`,
    );
    clack.log.error(error instanceof Error ? error.message : String(error));
    clack.log.warn(
      `Partial write: ${addedCount} of ${config.progPoints.length} prog points were added. Fix the YAML and use 'push' to retry.`,
    );
    process.exit(1);
  }
}

export async function seedFirestoreStep(
  db: Firestore,
  config: EncounterConfig,
  opts: AddCommandOptions,
): Promise<void> {
  const seed = opts.yes
    ? true
    : cancelIfCancel(await clack.confirm({ message: 'Seed Firestore?' }));
  if (!seed) return;

  const existing = await getEncounter(db, config.id);
  if (existing) {
    const overwrite = opts.yes
      ? true
      : cancelIfCancel(
          await clack.confirm({
            message: `Encounter '${config.id}' already exists in Firestore. Overwrite?`,
          }),
        );
    if (!overwrite) {
      clack.log.info('Firestore seeding skipped.');
      return;
    }
  }

  const encSpinner = clack.spinner();
  encSpinner.start('Creating encounter document...');
  try {
    await upsertEncounter(db, config.id, {
      name: config.name,
      description: config.description,
      active: true,
      progPartyThreshold: config.progPartyThreshold,
      clearPartyThreshold: config.clearPartyThreshold,
    });
    encSpinner.stop('Encounter document created');
  } catch (error) {
    encSpinner.stop('Failed to create encounter document');
    clack.log.error(error instanceof Error ? error.message : String(error));
    clack.log.warn(
      'Encounter document may not have been created. No prog points were written.',
    );
    process.exit(1);
  }

  await seedProgPoints(db, config);
}

export { planSourceEdits };
