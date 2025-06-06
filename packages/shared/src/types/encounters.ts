export enum Encounter {
  TOP = 'TOP',
  UWU = 'UWU',
  UCOB = 'UCOB',
  TEA = 'TEA',
  DSR = 'DSR',
  FRU = 'FRU',
}

export interface EncounterInfo {
  id: Encounter;
  name: string;
  shortName: string;
  friendlyDescription: string;
}

export const ENCOUNTER_INFO: Record<Encounter, EncounterInfo> = {
  [Encounter.TOP]: {
    id: Encounter.TOP,
    name: 'The Omega Protocol (Ultimate)',
    shortName: 'TOP',
    friendlyDescription: '[TOP] The Omega Protocol',
  },
  [Encounter.UWU]: {
    id: Encounter.UWU,
    name: "The Weapon's Refrain (Ultimate)",
    shortName: 'UWU',
    friendlyDescription: '[UwU] The Weapons Refrain',
  },
  [Encounter.UCOB]: {
    id: Encounter.UCOB,
    name: 'The Unending Coil of Bahamut (Ultimate)',
    shortName: 'UCOB',
    friendlyDescription: '[UCoB] The Unending Coil of Bahamut',
  },
  [Encounter.TEA]: {
    id: Encounter.TEA,
    name: 'The Epic of Alexander (Ultimate)',
    shortName: 'TEA',
    friendlyDescription: '[TEA] The Epic of Alexander',
  },
  [Encounter.DSR]: {
    id: Encounter.DSR,
    name: "Dragonsong's Reprise (Ultimate)",
    shortName: 'DSR',
    friendlyDescription: '[DSR] Dragonsong Reprise',
  },
  [Encounter.FRU]: {
    id: Encounter.FRU,
    name: 'Futures Rewritten (Ultimate)',
    shortName: 'FRU',
    friendlyDescription: '[FRU] Futures Rewritten',
  },
} as const;

export type EncounterKey = keyof typeof Encounter;
