import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import type { ProgPointDocument } from '../../../firebase/models/encounter.model.js';
import { PartyStatus } from '../../../firebase/models/signup.model.js';
import { cancelIfCancel } from '../../utils/clack.js';
import type { EncounterConfig } from '../../utils/config-loader.js';
import { loadEncounterConfig } from '../../utils/config-loader.js';
import { searchFflogsEncounters } from '../../utils/fflogs-lookup.js';
import {
  addProgPoint,
  getEncounter,
  upsertEncounter,
} from '../../utils/firestore.js';
import {
  applySourceEdits,
  detectCurrentUltimates,
  type EncounterSourceEdits,
  planSourceEdits,
  readEncountersConsts,
} from '../../utils/source-editor.js';

export interface AddCommandOptions {
  config?: string;
  dryRun?: boolean;
  yes?: boolean;
  fflogsEncounterId?: string;
}

async function promptFflogsIds(
  fflogsToken: string | undefined,
  cliFlag?: string,
): Promise<number[]> {
  if (cliFlag) {
    return cliFlag.split(',').map((s) => Number(s.trim()));
  }

  type FflogsMethod = 'search' | 'manual' | 'skip';

  const searchOption = fflogsToken
    ? [{ value: 'search' as FflogsMethod, label: 'Search FF Logs by name' }]
    : [];

  const method = cancelIfCancel(
    await clack.select<FflogsMethod>({
      message: 'FF Logs encounter IDs:',
      options: [
        ...searchOption,
        { value: 'manual' as FflogsMethod, label: 'Enter manually' },
        { value: 'skip' as FflogsMethod, label: 'Skip for now' },
      ],
    }),
  );

  if (method === 'skip') return [];

  if (method === 'manual') {
    const raw = cancelIfCancel(
      await clack.text({
        message: 'Enter FF Logs encounter IDs (comma-separated):',
        validate: (v) => {
          const ids = (v ?? '').split(',').map((s) => Number(s.trim()));
          return ids.every((n) => Number.isInteger(n) && n > 0)
            ? undefined
            : 'Must be comma-separated positive integers';
        },
      }),
    );
    return raw.split(',').map((s) => Number(s.trim()));
  }

  // Search
  const query = cancelIfCancel(
    await clack.text({
      message: 'Search term:',
      validate: (v) => (v?.trim() ? undefined : 'Required'),
    }),
  );

  const spinner = clack.spinner();
  spinner.start('Searching FF Logs...');
  // biome-ignore lint/style/noNonNullAssertion: fflogsToken is guaranteed non-null when method === 'search'
  const results = await searchFflogsEncounters(fflogsToken!, query);
  spinner.stop(`Found ${results.length} results`);

  if (results.length === 0) {
    clack.log.warn('No results found. Falling back to manual entry.');
    const raw = cancelIfCancel(
      await clack.text({
        message: 'Enter FF Logs encounter IDs (comma-separated):',
      }),
    );
    return raw.split(',').map((s) => Number(s.trim()));
  }

  const selected = cancelIfCancel(
    await clack.multiselect({
      message: 'Select matching encounters:',
      options: results.map((r) => ({
        value: r.id,
        label: `${r.name} (${r.zoneName}) — ID: ${r.id}`,
      })),
    }),
  );

  return selected as number[];
}

async function promptProgPoints(): Promise<
  Array<{ id: string; label: string; partyStatus: PartyStatus }>
> {
  const progPoints: Array<{
    id: string;
    label: string;
    partyStatus: PartyStatus;
  }> = [];

  for (;;) {
    const addMore = cancelIfCancel(
      await clack.confirm({
        message:
          progPoints.length === 0
            ? 'Add prog points now?'
            : `Add another prog point? (${progPoints.length} added so far)`,
      }),
    );
    if (!addMore) break;

    const id = cancelIfCancel(
      await clack.text({
        message: 'Prog point ID:',
        validate: (v) => (v?.trim() ? undefined : 'Required'),
      }),
    );
    const label = cancelIfCancel(
      await clack.text({
        message: 'Label (shown in Discord):',
        validate: (v) => (v?.trim() ? undefined : 'Required'),
      }),
    );
    const partyStatus = cancelIfCancel(
      await clack.select({
        message: 'Party status:',
        options: Object.values(PartyStatus).map((v) => ({
          value: v,
          label: v,
        })),
      }),
    );

    progPoints.push({ id: id.trim(), label: label.trim(), partyStatus });
  }

  return progPoints;
}

async function promptThreshold(
  message: string,
  progPoints: Array<{ id: string; label: string }>,
): Promise<string | undefined> {
  if (progPoints.length === 0) return undefined;

  const value = cancelIfCancel(
    await clack.select({
      message,
      options: [
        { value: '', label: 'Skip' },
        ...progPoints.map((p) => ({
          value: p.id,
          label: `${p.id} — ${p.label}`,
        })),
      ],
    }),
  );

  return value === '' ? undefined : value;
}

async function buildConfigFromPrompts(
  fflogsToken: string | undefined,
  opts: AddCommandOptions,
): Promise<EncounterConfig> {
  const id = cancelIfCancel(
    await clack.text({
      message: 'Encounter ID (uppercase, e.g. FRU_NEW):',
      validate: (v) =>
        /^[A-Z_]+$/.test((v ?? '').trim())
          ? undefined
          : 'Must be uppercase letters and underscores only',
    }),
  );
  const name = cancelIfCancel(
    await clack.text({
      message: 'Full name (e.g. Futures Rewritten (Ultimate)):',
      validate: (v) => (v?.trim() ? undefined : 'Required'),
    }),
  );
  const description = cancelIfCancel(
    await clack.text({
      message: 'Short description (e.g. [FRU] Futures Rewritten):',
      validate: (v) => (v?.trim() ? undefined : 'Required'),
    }),
  );

  type AppMode = 'ultimate' | 'legacy' | 'savage';
  const mode = cancelIfCancel(
    await clack.select<AppMode>({
      message: 'Application mode:',
      options: [
        {
          value: 'ultimate' as AppMode,
          label: 'ultimate — current active ultimate',
        },
        {
          value: 'legacy' as AppMode,
          label: 'legacy — past/retired encounter',
        },
        { value: 'savage' as AppMode, label: 'savage' },
      ],
    }),
  );

  const emojiRaw = cancelIfCancel(
    await clack.text({
      message: 'Discord emoji snowflake ID (optional, press Enter to skip):',
    }),
  );
  const emoji = emojiRaw.trim() || undefined;

  const fflogsEncounterIds = await promptFflogsIds(
    fflogsToken,
    opts.fflogsEncounterId,
  );
  const progPoints = await promptProgPoints();
  const progPartyThreshold = await promptThreshold(
    'Set prog party threshold:',
    progPoints,
  );
  const clearPartyThreshold = await promptThreshold(
    'Set clear party threshold:',
    progPoints,
  );

  return {
    id: id.trim(),
    name: name.trim(),
    description: description.trim(),
    mode,
    emoji,
    fflogsEncounterIds:
      fflogsEncounterIds.length > 0 ? fflogsEncounterIds : undefined,
    progPoints: progPoints.length > 0 ? progPoints : undefined,
    progPartyThreshold,
    clearPartyThreshold,
  };
}

function buildSourceEdits(
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

async function loadOrBuildConfig(
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

async function resolveUltimateCascade(
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

async function applySourceEditsStep(
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
      `Partial write: ${addedCount} of ${config.progPoints.length} prog points were added. Use 'manage-prog-points' to complete.`,
    );
    process.exit(1);
  }
}

async function seedFirestoreStep(
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

export async function runAddCommand(
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
