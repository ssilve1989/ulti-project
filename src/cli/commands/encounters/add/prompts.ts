import * as clack from '@clack/prompts';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import { cancelIfCancel } from '../../../utils/clack.js';
import type { EncounterConfig } from '../../../utils/config-loader.js';
import { searchFflogsEncounters } from '../../../utils/fflogs-lookup.js';
import type { AddCommandOptions } from './index.js';

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
        message: 'Prog point ID (used in Sheets, e.g. Giga Flare #1):',
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

export async function buildConfigFromPrompts(
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
