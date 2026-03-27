import { join } from 'node:path';
import * as clack from '@clack/prompts';
import type { Command } from 'commander';
import type { Firestore } from 'firebase-admin/firestore';
import { ctx } from '../../../config.js';
import {
  type EncounterYamlConfig,
  writeEncounterYaml,
} from '../../../utils/encounter-yaml.js';
import {
  getAllActiveEncounters,
  getAllProgPoints,
} from '../../../utils/firestore.js';

export async function runPull(db: Firestore): Promise<void> {
  clack.intro('Pull Encounters');

  const dirPath = join(process.cwd(), 'data', 'encounters');

  const fetchSpinner = clack.spinner();
  fetchSpinner.start('Fetching active encounters...');

  let encounters: Awaited<ReturnType<typeof getAllActiveEncounters>>;
  try {
    encounters = await getAllActiveEncounters(db);
    fetchSpinner.stop(`Found ${encounters.length} active encounter(s)`);
  } catch (error) {
    fetchSpinner.stop('Failed');
    clack.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (encounters.length === 0) {
    clack.outro('No active encounters to pull.');
    return;
  }

  for (const enc of encounters) {
    const spinner = clack.spinner();
    spinner.start(`Pulling ${enc.id}...`);

    try {
      const progPoints = await getAllProgPoints(db, enc.id);

      const yamlConfig: EncounterYamlConfig = {
        id: enc.id,
        name: enc.name,
        description: enc.description,
        ...(enc.mode !== undefined && { mode: enc.mode }),
        active: enc.active,
        ...(enc.emoji !== undefined && { emoji: enc.emoji }),
        ...(enc.fflogsEncounterIds !== undefined && {
          fflogsEncounterIds: enc.fflogsEncounterIds,
        }),
        ...(enc.progPartyThreshold !== undefined && {
          progPartyThreshold: enc.progPartyThreshold,
        }),
        ...(enc.clearPartyThreshold !== undefined && {
          clearPartyThreshold: enc.clearPartyThreshold,
        }),
        progPoints: progPoints.map(({ id, label, partyStatus, active }) => ({
          id,
          label,
          partyStatus,
          active,
        })),
      };

      writeEncounterYaml(dirPath, yamlConfig);
      spinner.stop(`${enc.id}.yaml`);
    } catch (error) {
      spinner.stop(`Failed: ${enc.id}`);
      clack.log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  clack.outro(`Pulled ${encounters.length} encounter(s) to data/encounters/`);
}

export function registerPullCommand(encountersCmd: Command): void {
  encountersCmd
    .command('pull')
    .description('Pull all active encounters from Firestore to YAML files')
    .action(async () => {
      const { db } = ctx;
      await runPull(db);
    });
}
