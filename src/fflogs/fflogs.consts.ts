import { Encounter } from '../encounters/encounters.consts.js';

export const getFflogsSdkToken = () => 'FFLOGS_GRAPHQL_SDK';

// fflogs encounter ids
export const EncounterIds = new Map<Encounter, number[]>([
  [Encounter.TOP, [1068, 1077]],
  [Encounter.DSR, [1065, 1076]],
  [Encounter.TEA, [1062, 1075, 1050]],
  [Encounter.UWU, [1061, 1074, 1048, 1042]],
  [Encounter.UCOB, [1060, 1073, 1047, 1039]],
  [Encounter.FRU, [1079]],
]);

export function expiredReportError(
  ageInDays: number,
  maximumDaysAllowed: number,
): string {
  return `FFLogs reports must not be older than ${maximumDaysAllowed} days. The linked report is ${ageInDays} days old.`;
}
