import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolve paths relative to the project root (three levels up from src/cli/utils/)
const ROOT = resolve(import.meta.dirname, '..', '..', '..');
export const ENCOUNTERS_CONSTS_PATH = resolve(
  ROOT,
  'src/encounters/encounters.consts.ts',
);
export const FFLOGS_CONSTS_PATH = resolve(ROOT, 'src/fflogs/fflogs.consts.ts');

export interface SourceChange {
  file: string;
  description: string;
}

export interface EncounterSourceEdits {
  id: string;
  value: string;
  name: string;
  description: string;
  mode: 'legacy' | 'ultimate' | 'savage';
  emoji?: string;
  fflogsIds?: number[];
  ultimateToFlip?: string;
}

// ─── Readers ─────────────────────────────────────────────────────────────────

export function readEncountersConsts(): string {
  return readFileSync(ENCOUNTERS_CONSTS_PATH, 'utf-8');
}

export function readFflogsConsts(): string {
  return readFileSync(FFLOGS_CONSTS_PATH, 'utf-8');
}

// ─── Detectors ───────────────────────────────────────────────────────────────

/**
 * Returns enum keys of all encounters currently tagged `mode: 'ultimate'`
 * in ENCOUNTER_CHOICES.
 */
export function detectCurrentUltimates(source: string): string[] {
  const matches: string[] = [];
  const regex = /value:\s*Encounter\.(\w+),\s*\n\s*mode:\s*'ultimate'/g;
  for (const match of source.matchAll(regex)) {
    matches.push(match[1]);
  }
  return matches;
}

// ─── Mutators (pure: take source string, return updated string) ──────────────

/** Appends `  KEY = 'VALUE',` inside the Encounter enum block. */
export function addToEncounterEnum(
  source: string,
  key: string,
  value: string,
): string {
  const marker = 'export enum Encounter {';
  const startIdx = source.indexOf(marker);
  if (startIdx === -1)
    throw new Error('Could not find Encounter enum in encounters.consts.ts');

  const closingIdx = source.indexOf('\n}', startIdx);
  if (closingIdx === -1)
    throw new Error('Could not find closing brace of Encounter enum');

  return (
    source.slice(0, closingIdx) +
    `\n  ${key} = '${value}',` +
    source.slice(closingIdx)
  );
}

/** Appends `  [Encounter.KEY]: 'value',` inside EncounterFriendlyDescription. */
export function addToEncounterFriendlyDescription(
  source: string,
  key: string,
  value: string,
): string {
  const marker = 'export const EncounterFriendlyDescription = Object.freeze({';
  const startIdx = source.indexOf(marker);
  if (startIdx === -1)
    throw new Error(
      'Could not find EncounterFriendlyDescription in encounters.consts.ts',
    );

  const closingIdx = source.indexOf('\n});', startIdx);
  if (closingIdx === -1)
    throw new Error('Could not find closing of EncounterFriendlyDescription');

  return (
    source.slice(0, closingIdx) +
    `\n  [Encounter.${key}]: '${value}',` +
    source.slice(closingIdx)
  );
}

/** Appends `  [Encounter.KEY]: 'snowflakeId',` inside EncounterEmoji. */
export function addToEncounterEmoji(
  source: string,
  key: string,
  snowflake: string,
): string {
  const marker =
    'export const EncounterEmoji: Record<string, string> = Object.freeze({';
  const startIdx = source.indexOf(marker);
  if (startIdx === -1)
    throw new Error('Could not find EncounterEmoji in encounters.consts.ts');

  const closingIdx = source.indexOf('\n});', startIdx);
  if (closingIdx === -1)
    throw new Error('Could not find closing of EncounterEmoji');

  return (
    source.slice(0, closingIdx) +
    `\n  [Encounter.${key}]: '${snowflake}',` +
    source.slice(closingIdx)
  );
}

/** Appends a `{ name, value, mode }` object inside ENCOUNTER_CHOICES. */
export function addToEncounterChoices(
  source: string,
  name: string,
  key: string,
  mode: string,
): string {
  const marker =
    'export const ENCOUNTER_CHOICES: Readonly<EncounterChoice>[] = [';
  const startIdx = source.indexOf(marker);
  if (startIdx === -1)
    throw new Error('Could not find ENCOUNTER_CHOICES in encounters.consts.ts');

  const closingIdx = source.indexOf('\n];', startIdx);
  if (closingIdx === -1)
    throw new Error('Could not find closing of ENCOUNTER_CHOICES');

  const entry = `\n  {\n    name: '${name}',\n    value: Encounter.${key},\n    mode: '${mode}',\n  },`;
  return source.slice(0, closingIdx) + entry + source.slice(closingIdx);
}

/**
 * Changes an existing ENCOUNTER_CHOICES entry from `mode: 'ultimate'` to `mode: 'legacy'`.
 * `key` is the Encounter enum key (e.g. 'FRU').
 */
export function flipEncounterModeToLegacy(source: string, key: string): string {
  const target = `    value: Encounter.${key},\n    mode: 'ultimate',`;
  const replacement = `    value: Encounter.${key},\n    mode: 'legacy',`;
  if (!source.includes(target)) {
    throw new Error(
      `Could not find ENCOUNTER_CHOICES entry for ${key} with mode: 'ultimate'`,
    );
  }
  return source.replace(target, replacement);
}

/** Appends `  [Encounter.KEY, [id1, id2]],` inside the EncounterIds Map. */
export function addToEncounterIds(
  source: string,
  key: string,
  ids: number[],
): string {
  const marker = 'export const EncounterIds = new Map<Encounter, number[]>([';
  const startIdx = source.indexOf(marker);
  if (startIdx === -1)
    throw new Error('Could not find EncounterIds in fflogs.consts.ts');

  const closingIdx = source.indexOf('\n]);', startIdx);
  if (closingIdx === -1)
    throw new Error('Could not find closing of EncounterIds Map');

  return (
    source.slice(0, closingIdx) +
    `\n  [Encounter.${key}, [${ids.join(', ')}]],` +
    source.slice(closingIdx)
  );
}

// ─── Writers ─────────────────────────────────────────────────────────────────

export function writeEncountersConsts(source: string): void {
  writeFileSync(ENCOUNTERS_CONSTS_PATH, source, 'utf-8');
}

export function writeFflogsConsts(source: string): void {
  writeFileSync(FFLOGS_CONSTS_PATH, source, 'utf-8');
}

// ─── High-level planner ──────────────────────────────────────────────────────

/**
 * Returns a preview of all changes that would be applied, without writing anything.
 */
export function planSourceEdits(edits: EncounterSourceEdits): SourceChange[] {
  const changes: SourceChange[] = [];

  changes.push({
    file: 'src/encounters/encounters.consts.ts',
    description: `+ Encounter enum: ${edits.id} = '${edits.value}'`,
  });
  changes.push({
    file: 'src/encounters/encounters.consts.ts',
    description: `+ EncounterFriendlyDescription: [Encounter.${edits.id}]: '${edits.name}'`,
  });
  if (edits.emoji) {
    changes.push({
      file: 'src/encounters/encounters.consts.ts',
      description: `+ EncounterEmoji: [Encounter.${edits.id}]: '${edits.emoji}'`,
    });
  }
  changes.push({
    file: 'src/encounters/encounters.consts.ts',
    description: `+ ENCOUNTER_CHOICES: { name: '${edits.name}', value: Encounter.${edits.id}, mode: '${edits.mode}' }`,
  });
  if (edits.ultimateToFlip) {
    changes.push({
      file: 'src/encounters/encounters.consts.ts',
      description: `~ ENCOUNTER_CHOICES[${edits.ultimateToFlip}]: mode 'ultimate' → 'legacy'`,
    });
  }
  if (edits.fflogsIds && edits.fflogsIds.length > 0) {
    changes.push({
      file: 'src/fflogs/fflogs.consts.ts',
      description: `+ EncounterIds: [Encounter.${edits.id}, [${edits.fflogsIds.join(', ')}]]`,
    });
  }

  return changes;
}

/**
 * Applies all source edits in-place. Throws on the first error.
 * Each file is fully computed before being written (atomic per file).
 */
export function applySourceEdits(edits: EncounterSourceEdits): void {
  // Compute the full updated encounters.consts.ts before writing
  let encountersSource = readEncountersConsts();
  encountersSource = addToEncounterEnum(
    encountersSource,
    edits.id,
    edits.value,
  );
  encountersSource = addToEncounterFriendlyDescription(
    encountersSource,
    edits.id,
    edits.name,
  );
  if (edits.emoji) {
    encountersSource = addToEncounterEmoji(
      encountersSource,
      edits.id,
      edits.emoji,
    );
  }
  if (edits.ultimateToFlip) {
    encountersSource = flipEncounterModeToLegacy(
      encountersSource,
      edits.ultimateToFlip,
    );
  }
  encountersSource = addToEncounterChoices(
    encountersSource,
    edits.name,
    edits.id,
    edits.mode,
  );

  // Compute the full updated fflogs.consts.ts before writing
  let fflogsSource: string | undefined;
  if (edits.fflogsIds && edits.fflogsIds.length > 0) {
    fflogsSource = readFflogsConsts();
    fflogsSource = addToEncounterIds(fflogsSource, edits.id, edits.fflogsIds);
  }

  // Write both files (atomic per file — full rewrite)
  writeEncountersConsts(encountersSource);
  if (fflogsSource !== undefined) {
    writeFflogsConsts(fflogsSource);
  }
}
