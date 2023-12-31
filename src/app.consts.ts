// TODO: cleanup file into domain specific files
export enum Encounter {
  'TOP' = 'top',
  'UWU' = 'uwu',
  'UCOB' = 'ucob',
  'TEA' = 'tea',
  'DSR' = 'dsr',
}

export const EncounterFriendlyDescription = Object.freeze({
  [Encounter.TOP]: 'The Omega Protocol (Ultimate)',
  [Encounter.UWU]: 'The Weapons Refrain (Ultimate)',
  [Encounter.UCOB]: 'The Unending Coil of Bahamut (Ultimate)',
  [Encounter.TEA]: 'The Epic of Alexander (Ultimate)',
  [Encounter.DSR]: 'Dragonsong Reprise (Ultimate)',
});

// these identifiers are specific to the ulti-project sausfest discord
// they should only render correctly in that discord
export const EncounterEmoji = Object.freeze({
  [Encounter.TOP]: '<:top_totem:1128023323796852877>',
  [Encounter.UWU]: '<:ucob_totem:1128006065930375333>',
  [Encounter.UCOB]: '<:dsr_totem:1128006062780448768>',
  [Encounter.TEA]: '<:uwu_totem:1128006064701444188>',
  [Encounter.DSR]: '<:tea_totem:1128006067419369612>',
});
