// TODO: cleanup file into domain specific files
export enum Encounter {
  'TOP' = 'top',
  'UWU' = 'uwu',
  'UCOB' = 'ucob',
  'TEA' = 'tea',
  'DSR' = 'dsr',
}

export const EncounterFriendlyDescription = {
  [Encounter.TOP]: 'The Omega Protocol (Ultimate)',
  [Encounter.UWU]: 'The Weapons Refrain (Ultimate)',
  [Encounter.UCOB]: 'The Unending Coil of Bahamut (Ultimate)',
  [Encounter.TEA]: 'The Epic of Alexander (Ultimate)',
  [Encounter.DSR]: 'Dragonsong Reprise (Ultimate)',
};
