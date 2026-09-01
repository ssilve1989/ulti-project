/**
 * FFLogs API types for JSON scalars
 */

export interface EncounterRankings {
  /** Total number of kills for the encounter */
  totalKills: number;
  /** Additional fields can be added as needed */
  [key: string]: unknown;
}

/**
 * Type guard to check if unknown data is EncounterRankings
 */
export function isEncounterRankings(data: unknown): data is EncounterRankings {
  return (
    typeof data === 'object' &&
    data !== null &&
    'totalKills' in data &&
    typeof (data as Record<string, unknown>).totalKills === 'number'
  );
}
