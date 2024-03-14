import { PartyType } from '../firebase/models/signup.model.js';

export enum Encounter {
  TOP = 'TOP',
  UWU = 'UWU',
  UCOB = 'UCOB',
  TEA = 'TEA',
  DSR = 'DSR',
}

export const EncounterFriendlyDescription = Object.freeze({
  [Encounter.TOP]: 'The Omega Protocol (Ultimate)',
  [Encounter.UWU]: 'The Weapons Refrain (Ultimate)',
  [Encounter.UCOB]: 'The Unending Coil of Bahamut (Ultimate)',
  [Encounter.TEA]: 'The Epic of Alexander (Ultimate)',
  [Encounter.DSR]: 'Dragonsong Reprise (Ultimate)',
});

// these identifiers are specific to the ulti-project sausfest discord
// the bot would need to be part of that discord for these to render correctly
export const EncounterEmoji = Object.freeze({
  [Encounter.DSR]: '<:dsr_totem:1128006062780448768>',
  [Encounter.TEA]: '<:tea_totem:1128006067419369612>',
  [Encounter.TOP]: '<:top_totem:1128023323796852877>',
  [Encounter.UCOB]: '<:ucob_totem:1128006065930375333>',
  [Encounter.UWU]: '<:uwu_totem:1128006064701444188>',
});

// prog point lookup hash for each encounter and what party type the prog point belongs to
// along with their label for the slash command options
type ProgPointOption = {
  label: string;
  partyType: PartyType;
};

// The keys of these objects are what get associated as the values for the Google Sheet/Slash Command options
export const EncounterProgPoints: Record<
  keyof typeof Encounter,
  Record<string, ProgPointOption>
> = {
  [Encounter.DSR]: {
    Strength: {
      label: 'Phase 2: Strength of the Ward',
      partyType: PartyType.EARLY_PROG_PARTY,
    },
    Sanctity: {
      label: 'Phase 2: Sanctity of the Ward',
      partyType: PartyType.EARLY_PROG_PARTY,
    },
    Nidhogg: {
      label: 'Phase 3: Nidhogg',
      partyType: PartyType.PROG_PARTY,
    },
    Eyes: {
      label: 'Phase 4: Eyes',
      partyType: PartyType.PROG_PARTY,
    },
    Rewind: {
      label: 'Phase 4: Rewind',
      partyType: PartyType.PROG_PARTY,
    },
    WOTH: {
      label: 'Phase 5: Wrath of the Heavens',
      partyType: PartyType.PROG_PARTY,
    },
    DOTH: {
      label: 'Phase 5: Death of the Heavens',
      partyType: PartyType.PROG_PARTY,
    },
    WB1: {
      label: 'Phase 6: Wyrmsbreath 1',
      partyType: PartyType.PROG_PARTY,
    },
    WROTH: {
      label: 'Phase 6: Wroth Flames',
      partyType: PartyType.PROG_PARTY,
    },
    WB2: {
      label: 'Phase 6: Wyrmsbreath 2',
      partyType: PartyType.PROG_PARTY,
    },
    'P6 Enrage': {
      label: 'Phase 6: Enrage',
      partyType: PartyType.CLEAR_PARTY,
    },
    AM1: {
      label: 'Phase 7: Akh Morn 1',
      partyType: PartyType.CLEAR_PARTY,
    },
    'Gigaflare 1': {
      label: 'Phase 7: Gigaflare 1',
      partyType: PartyType.CLEAR_PARTY,
    },
    AM2: {
      label: 'Phase 7: Akh Morn 2',
      partyType: PartyType.CLEAR_PARTY,
    },
    'Gigaflare 2': {
      label: 'Phase 7: Gigaflare 2',
      partyType: PartyType.CLEAR_PARTY,
    },
    AM3: {
      label: 'Phase 7: Akh Morn 3',
      partyType: PartyType.CLEAR_PARTY,
    },
    'P7 Enrage': {
      label: 'Phase 7: Enrage',
      partyType: PartyType.CLEAR_PARTY,
    },
  },
  [Encounter.TEA]: {
    'Limit Cut': {
      label: 'Phase 1: Limit Cut',
      partyType: PartyType.EARLY_PROG_PARTY,
    },
    BJCC: {
      label: 'Phase 2: BJCC',
      partyType: PartyType.PROG_PARTY,
    },
    'Time Stop': {
      label: 'Phase 3: Time Stop',
      partyType: PartyType.PROG_PARTY,
    },
    Inception: {
      label: 'Phase 3: Inception',
      partyType: PartyType.PROG_PARTY,
    },
    Wormhole: {
      label: 'Phase 3: Wormhole',
      partyType: PartyType.PROG_PARTY,
    },
    'Final Word': {
      label: 'Phase 4: Final Word',
      partyType: PartyType.CLEAR_PARTY,
    },
    'Fate Cal A': {
      label: 'Phase 4: Fate Calibration (Alpha)',
      partyType: PartyType.CLEAR_PARTY,
    },
    'Fate Cal B': {
      label: 'Phase 4: Fate Calibration (Beta)',
      partyType: PartyType.CLEAR_PARTY,
    },
    Trines: {
      label: 'Phase 4: Trines',
      partyType: PartyType.CLEAR_PARTY,
    },
  },
  [Encounter.TOP]: {
    'P2 Party Synergy': {
      label: 'Phase 2: Party Synergy',
      partyType: PartyType.EARLY_PROG_PARTY,
    },
    'P2 Limitless': {
      label: 'Phase 2: Limitless Synergy',
      partyType: PartyType.EARLY_PROG_PARTY,
    },
    'P3 Transition': {
      label: 'Phase 3: Transition',
      partyType: PartyType.EARLY_PROG_PARTY,
    },
    'P3 Hello World': {
      label: 'Phase 3: Hello World',
      partyType: PartyType.EARLY_PROG_PARTY,
    },
    'P3 Monitors': {
      label: 'Phase 3: Monitors',
      partyType: PartyType.EARLY_PROG_PARTY,
    },
    'P3 Enrage': {
      label: 'Phase 3: Enrage',
      partyType: PartyType.EARLY_PROG_PARTY,
    },
    P4: {
      label: 'Phase 4: Blue Screen',
      partyType: PartyType.PROG_PARTY,
    },
    'P5 Delta': {
      label: 'Phase 5: Delta',
      partyType: PartyType.PROG_PARTY,
    },
    'P5 Sigma': {
      label: 'Phase 5: Sigma',
      partyType: PartyType.PROG_PARTY,
    },
    'P5 Omega': {
      label: 'Phase 5: Omega',
      partyType: PartyType.PROG_PARTY,
    },
    'P5 Enrage': {
      label: 'Phase 5: Enrage',
      partyType: PartyType.PROG_PARTY,
    },
  },
  [Encounter.UCOB]: {
    Nael: { label: 'Phase 2: Nael', partyType: PartyType.EARLY_PROG_PARTY },
    QMT: {
      label: 'Phase 3: Quickmarch Trio',
      partyType: PartyType.PROG_PARTY,
    },
    BFT: {
      label: 'Phase 3: Blackfire Trio',
      partyType: PartyType.PROG_PARTY,
    },
    Fellruin: {
      label: 'Phase 3: Fellruin Trio',
      partyType: PartyType.PROG_PARTY,
    },
    Heavensfall: {
      label: 'Phase 3: Heavensfall Trio',
      partyType: PartyType.PROG_PARTY,
    },
    Tenstrike: {
      label: 'Phase 3: Tenstrike Trio',
      partyType: PartyType.PROG_PARTY,
    },
    'Grand Octet': {
      label: 'Phase 3: Grand Octet',
      partyType: PartyType.PROG_PARTY,
    },
    Adds: { label: 'Phase 4: Adds', partyType: PartyType.CLEAR_PARTY },
    Golden: {
      label: 'Phase 5: Golden Bahamut',
      partyType: PartyType.CLEAR_PARTY,
    },
  },
  [Encounter.UWU]: {
    Ifrit: {
      label: 'Phase 2: Ifrit',
      partyType: PartyType.EARLY_PROG_PARTY,
    },
    Titan: {
      label: 'Phase 3: Titan',
      partyType: PartyType.PROG_PARTY,
    },
    Predation: {
      label: 'Phase 4: Predation',
      partyType: PartyType.PROG_PARTY,
    },
    Annihilation: {
      label: 'Phase 4: Annihilation',
      partyType: PartyType.PROG_PARTY,
    },
    Suppression: {
      label: 'Phase 4: Suppression',
      partyType: PartyType.CLEAR_PARTY,
    },
    'Primal Roulette': {
      label: 'Phase 4: Primal Roulette',
      partyType: PartyType.CLEAR_PARTY,
    },
  },
};
