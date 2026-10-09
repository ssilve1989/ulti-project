/** A squad as the board shows it. */
export interface SquadView {
  id: string;
  name: string;
  tag: string;
  color: string;
}

/** What a signed-in member may do on the board, decided from their guild roles. */
export type BoardAccess =
  | { kind: 'denied'; reason: 'not-in-guild' | 'no-role' }
  | { kind: 'viewer' }
  | { kind: 'squad'; squad: SquadView }
  | { kind: 'squad-conflict'; squads: SquadView[] };

/** `GET /api/me`. */
export interface MeResponse {
  discordId: string;
  displayName: string;
  avatarUrl: string | null;
  access: BoardAccess;
}
