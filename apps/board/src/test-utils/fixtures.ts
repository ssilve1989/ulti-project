import {
  type BoardAccess,
  type BoardParticipant,
  JOB_ROLE,
  type MeResponse,
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
  const job = overrides.job ?? 'PLD';
  return {
    id: `${overrides.discordId}-${encounter}`,
    encounter,
    displayName: overrides.character,
    world: 'Jenova',
    job,
    jobRole: JOB_ROLE[job],
    phase: { label: 'P4: Enrage', order: 40, bucket: 'prog' },
    claim: null,
    ...overrides,
  };
}
