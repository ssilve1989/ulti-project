import type { BoardAccess, MeResponse, SquadView } from '@ulti-project/shared';

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
