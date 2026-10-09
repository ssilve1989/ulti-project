import {
  type Encounter,
  type EventPhase,
  JOBS,
  type Job,
  PartyStatus,
  type ProgPointDocument,
  type SettingsDocument,
} from '@ulti-project/shared';

// 19 digits starting 999000: real snowflakes won't get there until ~2090
const SEED_MARKER = '999000';
const SEED_ID_LENGTH = 19;

/** The fake Discord id of seeded player `index`; 0 is the fake lead who claims. */
export function seededDiscordId(index: number): string {
  return `${SEED_MARKER}${String(index).padStart(SEED_ID_LENGTH - SEED_MARKER.length, '0')}`;
}

export function isSeeded(discordId: string): boolean {
  return (
    discordId.length === SEED_ID_LENGTH && discordId.startsWith(SEED_MARKER)
  );
}

/** Why seeding must not run in `env`, or undefined if it may. */
export function seedRefusal(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  if (env.NODE_ENV === 'production') {
    return 'Refusing to seed: NODE_ENV is production.';
  }
  if (env.npm_lifecycle_event === 'cli:prod') {
    return 'Refusing to seed: this is pnpm cli:prod.';
  }
  if (env.ALLOW_TEST_SEED !== 'true') {
    return 'Refusing to seed: ALLOW_TEST_SEED is not "true". Only the development env (pnpm cli) sets it.';
  }
  if (!env.FIRESTORE_DATABASE_ID) {
    return 'Refusing to seed: FIRESTORE_DATABASE_ID is not set, so this would write to the default database.';
  }
  return undefined;
}

/**
 * Every phase a member could sign up with for `encounter`: like
 * EventEligibilityService.resolve, one per role at the furthest prog point
 * that role maps to, plus the clear role. The label differs: the bot uses the
 * Discord role's name, which needs Discord, so this uses the prog point's.
 */
export function eventPhases(
  encounter: Encounter,
  progPoints: readonly ProgPointDocument[],
  settings: SettingsDocument | undefined,
): EventPhase[] {
  const mapping = settings?.progPointRoles?.[encounter] ?? {};
  const byRole = new Map<string, EventPhase>();
  for (const point of progPoints) {
    const roleId = mapping[point.id];
    if (roleId === undefined) continue;
    const furthest = byRole.get(roleId);
    // strictly greater, so a tie keeps the first, as the bot's reduce does
    if (furthest && point.order <= furthest.order) continue;
    byRole.set(roleId, {
      roleId,
      label: point.label,
      order: point.order,
      bucket: point.partyStatus === PartyStatus.ClearParty ? 'clear' : 'prog',
    });
  }
  const phases = [...byRole.values()];
  const clearRole = settings?.clearRoles?.[encounter];
  if (clearRole) {
    phases.push({
      roleId: clearRole,
      label: 'Cleared',
      order: progPoints.length,
      bucket: 'clear',
    });
  }
  return phases;
}

export interface SeedEncounter {
  encounter: Encounter;
  phases: readonly EventPhase[];
}

export interface SeedPlayer {
  discordId: string;
  encounter: Encounter;
  job: Job;
  character: string;
  world: string;
  phase: EventPhase;
  signedUpAt: Date;
}

const FIRST_NAMES = [
  'Alisaie',
  'Thancred',
  'Ryne',
  'Haurchefant',
  'Ysayle',
  'Merlwyb',
  'Raubahn',
  'Lyna',
  'Aymeric',
  'Tataru',
];
const LAST_NAMES = [
  'Ashvale',
  'Brightwind',
  'Corvel',
  'Duskmere',
  'Emberfall',
  'Frostholm',
  'Greythorn',
  'Highmoor',
  'Ironleaf',
  'Jadecrest',
];
const AETHER_WORLDS = [
  'Adamantoise',
  'Cactuar',
  'Faerie',
  'Gilgamesh',
  'Jenova',
  'Midgardsormr',
  'Sargatanas',
  'Siren',
];

function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length];
}

/**
 * `count` fake players, deterministic per index: round-robin over the
 * encounters, alternating prog and clear phases within each (when it has
 * both), signed up seven minutes apart up to `now`. Each encounter needs at
 * least one phase.
 */
export function seedPlayers(
  count: number,
  encounters: readonly SeedEncounter[],
  now: Date,
): SeedPlayer[] {
  return Array.from({ length: count }, (_, i) => {
    const { encounter, phases } = pick(encounters, i);
    const round = Math.floor(i / encounters.length);
    const buckets = [
      phases.filter((phase) => phase.bucket === 'prog'),
      phases.filter((phase) => phase.bucket === 'clear'),
    ].filter((bucket) => bucket.length > 0);
    return {
      discordId: seededDiscordId(i + 1),
      encounter,
      job: pick(JOBS, i),
      character: `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, Math.floor(i / FIRST_NAMES.length))}`,
      world: pick(AETHER_WORLDS, i),
      phase: pick(pick(buckets, round), Math.floor(round / buckets.length)),
      signedUpAt: new Date(now.getTime() - (count - i) * 7 * 60_000),
    };
  });
}
