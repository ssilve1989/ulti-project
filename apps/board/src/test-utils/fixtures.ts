import {
  type BoardAccess,
  type BoardEvent,
  type BoardParticipant,
  JOB_PARTY_ROLE,
  type MeResponse,
  PARTY_ROLE_JOB_ROLE,
  type SquadView,
} from '@ulti-project/shared';

export const FROGE: SquadView = Object.freeze({
  id: 'squad-froge',
  name: 'Froge Army',
  tag: 'FRG',
  color: '#16a34a',
});

export const SPACE: SquadView = Object.freeze({
  id: 'squad-space',
  name: 'Space Travelers',
  tag: 'SPC',
  color: '#0891b2',
});

export function meResponse(access: BoardAccess): MeResponse {
  return {
    discordId: 'lead-1',
    displayName: 'Aeryn',
    avatarUrl: 'https://cdn.discordapp.com/avatars/lead-1/a.png',
    access,
  };
}

export function participant(
  overrides: Partial<BoardParticipant> &
    Pick<BoardParticipant, 'discordId' | 'character'>,
): BoardParticipant {
  const encounter = overrides.encounter ?? 'FRU';
  const job = overrides.job === undefined ? 'PLD' : overrides.job;
  const role = overrides.role ?? (job === null ? 'tank' : JOB_PARTY_ROLE[job]);
  return {
    id: `${overrides.discordId}-${encounter}`,
    encounter,
    displayName: overrides.character,
    world: 'Jenova',
    job,
    role,
    jobRole: PARTY_ROLE_JOB_ROLE[role],
    phase: { label: 'P4: Enrage', order: 40, bucket: 'prog' },
    claim: null,
    ...overrides,
  };
}

export function boardEvent(overrides?: Partial<BoardEvent>): BoardEvent {
  return {
    id: 'event-1',
    title: 'Saturday FRU',
    startsAt: '2026-10-10T00:00:00.000Z',
    signupsCloseAt: '2026-10-09T22:00:00.000Z',
    status: 'open',
    encounters: [
      {
        id: 'FRU',
        name: 'Futures Rewritten',
        progPartyThreshold: 'P3: Apocalypse',
        clearPartyThreshold: 'P5: Fulgent Blade 1',
      },
    ],
    participants: [],
    squads: [FROGE, SPACE],
    rosters: [],
    ...overrides,
  };
}
