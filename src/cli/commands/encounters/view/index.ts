import * as clack from '@clack/prompts';
import type { Command } from 'commander';
import type { Firestore } from 'firebase-admin/firestore';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../../../encounters/encounters.consts.js';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import type { CliContext } from '../../../config.js';
import {
  getAllActiveEncounters,
  getAllProgPoints,
  getEncounter,
} from '../../../utils/firestore.js';

const PARTY_STATUS_ICON: Record<PartyStatus, string> = {
  [PartyStatus.EarlyProgParty]: '🟡',
  [PartyStatus.ProgParty]: '🟠',
  [PartyStatus.ClearParty]: '🔴',
  [PartyStatus.Cleared]: '✅',
};

function formatProgPointRow(
  index: number,
  p: {
    id: string;
    label: string;
    partyStatus: PartyStatus;
    active: boolean;
    order: number;
  },
): string {
  const active = p.active ? '✅' : '❌';
  const icon = PARTY_STATUS_ICON[p.partyStatus] ?? '⚪';
  return `  ${String(index).padEnd(3)} ${active}  ${p.id.padEnd(16)} ${p.label.padEnd(28)} ${icon} ${p.partyStatus}`;
}

async function viewSingleEncounter(
  db: Firestore,
  encounterId: string,
): Promise<void> {
  const [encounter, progPoints] = await Promise.all([
    getEncounter(db, encounterId),
    getAllProgPoints(db, encounterId),
  ]);

  if (!encounter) {
    clack.log.warn(`Encounter '${encounterId}' not found in Firestore.`);
    return;
  }

  const sorted = [...progPoints].sort((a, b) => a.order - b.order);
  const progThreshold = sorted.find(
    (p) => p.id === encounter.progPartyThreshold,
  );
  const clearThreshold = sorted.find(
    (p) => p.id === encounter.clearPartyThreshold,
  );

  clack.log.info(
    [
      `${encounter.name} (${encounterId})`,
      `  Prog threshold:  ${progThreshold ? `${progThreshold.label} (${progThreshold.id})` : 'Not set'}`,
      `  Clear threshold: ${clearThreshold ? `${clearThreshold.label} (${clearThreshold.id})` : 'Not set'}`,
      '',
      `  ${'#'.padEnd(4)} ${''.padEnd(5)} ${'ID'.padEnd(16)} ${'Label'.padEnd(28)} Party Status`,
      `  ${'─'.repeat(80)}`,
      ...sorted.map((p, i) => formatProgPointRow(i, p)),
    ].join('\n'),
  );
}

async function viewAllEncounters(db: Firestore): Promise<void> {
  const active = await getAllActiveEncounters(db);

  if (active.length === 0) {
    clack.log.warn('No active encounters found in Firestore.');
    return;
  }

  const lines = [
    `  ${'ID'.padEnd(8)} ${'Name'.padEnd(36)} ${'Prog Points'.padEnd(12)} Thresholds`,
    `  ${'─'.repeat(72)}`,
  ];

  for (const enc of active) {
    const progPoints = await getAllProgPoints(db, enc.id);
    const hasProg = enc.progPartyThreshold ? '✅' : '❌';
    const hasClear = enc.clearPartyThreshold ? '✅' : '❌';
    const name =
      enc.name ?? EncounterFriendlyDescription[enc.id as Encounter] ?? enc.id;
    lines.push(
      `  ${enc.id.padEnd(8)} ${name.padEnd(36)} ${String(progPoints.length).padEnd(12)} prog:${hasProg} clear:${hasClear}`,
    );
  }

  clack.log.info(lines.join('\n'));
}

export async function runView(
  db: Firestore,
  encounterId?: string,
): Promise<void> {
  clack.intro('View Encounter');

  const spinner = clack.spinner();
  spinner.start('Fetching encounter data...');

  try {
    spinner.stop('');
    if (encounterId) {
      await viewSingleEncounter(db, encounterId);
    } else {
      await viewAllEncounters(db);
    }
  } catch (error) {
    spinner.stop('Failed');
    clack.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  clack.outro('Done');
}

export function registerViewCommand(
  encountersCmd: Command,
  getCtx: () => CliContext,
): void {
  encountersCmd
    .command('view [encounter-id]')
    .description('View encounter configuration from Firestore')
    .action(async (encounterId?: string) => {
      const { db } = getCtx();
      await runView(db, encounterId);
    });
}
