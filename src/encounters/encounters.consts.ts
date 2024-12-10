import type { ApplicationMode, ApplicationModeConfig } from '../app.config.js';
import { PartyStatus } from '../firebase/models/signup.model.js';

export enum Encounter {
  TOP = 'TOP',
  UWU = 'UWU',
  UCOB = 'UCOB',
  TEA = 'TEA',
  DSR = 'DSR',
  FRU = 'FRU',
}

export const EncounterFriendlyDescription = Object.freeze({
  [Encounter.TOP]: '[TOP] The Omega Protocol',
  [Encounter.UWU]: '[UwU] The Weapons Refrain',
  [Encounter.UCOB]: '[UCoB] The Unending Coil of Bahamut',
  [Encounter.TEA]: '[TEA] The Epic of Alexander',
  [Encounter.DSR]: '[DSR] Dragonsong Reprise',
  [Encounter.FRU]: '[FRU] Futures Rewritten',
});

// these identifiers are specific to the ulti-project sausfest discord
// the bot would need to be part of that discord for these to render correctly
// this is brittle because if the emojis change in the server these references will fail
// alternatively we could always lookup the emojis and cache their names at startup but forgoing that for now
export const EncounterEmoji: Record<string, string> = Object.freeze({
  [Encounter.DSR]: '1128006062780448768',
  [Encounter.TEA]: '1128006067419369612',
  [Encounter.TOP]: '1128023323796852877',
  [Encounter.UCOB]: '1128006065930375333',
  [Encounter.UWU]: '1128006064701444188',
  [Encounter.FRU]: '1314628063782506506',
});

// prog point lookup hash for each encounter and what party type the prog point belongs to
// along with their label for the slash command options
export type ProgPointOption = {
  label: string;
  partyStatus: PartyStatus;
};

// The keys of these objects are what get associated as the values for the Google Sheet/Slash Command options
export const EncounterProgPoints: Record<
  keyof typeof Encounter,
  Record<string, ProgPointOption>
> = {
  [Encounter.DSR]: {
    Strength: {
      label: 'Phase 2: Strength of the Ward',
      partyStatus: PartyStatus.EarlyProgParty,
    },
    Sanctity: {
      label: 'Phase 2: Sanctity of the Ward',
      partyStatus: PartyStatus.EarlyProgParty,
    },
    Nidhogg: {
      label: 'Phase 3: Nidhogg',
      partyStatus: PartyStatus.ProgParty,
    },
    Eyes: {
      label: 'Phase 4: Eyes',
      partyStatus: PartyStatus.ProgParty,
    },
    Rewind: {
      label: 'Phase 4: Rewind',
      partyStatus: PartyStatus.ProgParty,
    },
    WOTH: {
      label: 'Phase 5: Wrath of the Heavens',
      partyStatus: PartyStatus.ProgParty,
    },
    DOTH: {
      label: 'Phase 5: Death of the Heavens',
      partyStatus: PartyStatus.ProgParty,
    },
    WB1: {
      label: 'Phase 6: Wyrmsbreath 1',
      partyStatus: PartyStatus.ProgParty,
    },
    HW1: {
      label: 'Phase 6: Hallowed Wings 1',
      partyStatus: PartyStatus.ProgParty,
    },
    'Wroth Flames': {
      label: 'Phase 6: Wroth Flames',
      partyStatus: PartyStatus.ProgParty,
    },
    HW2: {
      label: 'Phase 6: Hallowed Wings 2',
      partyStatus: PartyStatus.ProgParty,
    },
    WB2: {
      label: 'Phase 6: Wyrmsbreath 2',
      partyStatus: PartyStatus.ProgParty,
    },
    'P6 Enrage': {
      label: 'Phase 6: Enrage',
      partyStatus: PartyStatus.ClearParty,
    },
    'Exa #1': {
      label: 'Phase 7: Exaflare 1',
      partyStatus: PartyStatus.ClearParty,
    },
    'Akh Morn #1': {
      label: 'Phase 7: Akh Morn 1',
      partyStatus: PartyStatus.ClearParty,
    },
    'Giga Flare #1': {
      label: 'Phase 7: Gigaflare 1',
      partyStatus: PartyStatus.ClearParty,
    },
    'Akh Morn #2': {
      label: 'Phase 7: Akh Morn 2',
      partyStatus: PartyStatus.ClearParty,
    },
    'Giga Flare #2': {
      label: 'Phase 7: Gigaflare 2',
      partyStatus: PartyStatus.ClearParty,
    },
    'Akh Morn #3': {
      label: 'Phase 7: Akh Morn 3',
      partyStatus: PartyStatus.ClearParty,
    },
    'P7 Enrage': {
      label: 'Phase 7: Enrage',
      partyStatus: PartyStatus.ClearParty,
    },
  },
  [Encounter.TEA]: {
    'Limit Cut': {
      label: 'Phase 1: Limit Cut',
      partyStatus: PartyStatus.EarlyProgParty,
    },
    BJCC: {
      label: 'Phase 2: BJCC',
      partyStatus: PartyStatus.ProgParty,
    },
    'Time Stop': {
      label: 'Phase 3: Time Stop',
      partyStatus: PartyStatus.ProgParty,
    },
    Inception: {
      label: 'Phase 3: Inception',
      partyStatus: PartyStatus.ProgParty,
    },
    Wormhole: {
      label: 'Phase 3: Wormhole',
      partyStatus: PartyStatus.ProgParty,
    },
    'J Waves': {
      label: 'Phase 3: J Waves',
      partyStatus: PartyStatus.ProgParty,
    },
    'Final Word': {
      label: 'Phase 4: Final Word',
      partyStatus: PartyStatus.ClearParty,
    },
    'Fate Cal: A': {
      label: 'Phase 4: Fate Calibration (Alpha)',
      partyStatus: PartyStatus.ClearParty,
    },
    'Fate Cal: B': {
      label: 'Phase 4: Fate Calibration (Beta)',
      partyStatus: PartyStatus.ClearParty,
    },
    'Trines (Enrage)': {
      label: 'Phase 4: Trines',
      partyStatus: PartyStatus.ClearParty,
    },
  },
  [Encounter.TOP]: {
    'P2 Party Synergy': {
      label: 'Phase 2: Party Synergy',
      partyStatus: PartyStatus.EarlyProgParty,
    },
    'P2 Limitless': {
      label: 'Phase 2: Limitless Synergy',
      partyStatus: PartyStatus.EarlyProgParty,
    },
    'P3 Transition': {
      label: 'Phase 3: Transition',
      partyStatus: PartyStatus.EarlyProgParty,
    },
    'P3 Hello World': {
      label: 'Phase 3: Hello World',
      partyStatus: PartyStatus.EarlyProgParty,
    },
    'P3 Monitors': {
      label: 'Phase 3: Monitors',
      partyStatus: PartyStatus.EarlyProgParty,
    },
    'P3 Enrage': {
      label: 'Phase 3: Enrage',
      partyStatus: PartyStatus.EarlyProgParty,
    },
    P4: {
      label: 'Phase 4: Blue Screen',
      partyStatus: PartyStatus.ProgParty,
    },
    'P5 Delta': {
      label: 'Phase 5: Delta',
      partyStatus: PartyStatus.ProgParty,
    },
    'P5 Sigma': {
      label: 'Phase 5: Sigma',
      partyStatus: PartyStatus.ProgParty,
    },
    'P5 Omega': {
      label: 'Phase 5: Omega',
      partyStatus: PartyStatus.ProgParty,
    },
    'P5 Enrage': {
      label: 'Phase 5: Enrage',
      partyStatus: PartyStatus.ProgParty,
    },
    'P6 Exasquares 1': {
      label: 'Phase 6: Exasquares 1',
      partyStatus: PartyStatus.ProgParty,
    },
    'P6 Cosmo Dive 1': {
      label: 'Phase 6: Cosmo Dive 1',
      partyStatus: PartyStatus.ProgParty,
    },
    'P6 Wave Cannon 1': {
      label: 'Phase 6: Wave Cannon 1',
      partyStatus: PartyStatus.ClearParty,
    },
    'P6 Wave Cannon 2': {
      label: 'Phase 6: Wave Cannon 2',
      partyStatus: PartyStatus.ClearParty,
    },
    'P6 Cosmo Dive 2': {
      label: 'Phase 6: Cosmo Dive 2',
      partyStatus: PartyStatus.ClearParty,
    },
    'P6 Cosmo Meteor': {
      label: 'Phase 6: Cosmo Meteor',
      partyStatus: PartyStatus.ClearParty,
    },
    'P6 Enrage': {
      label: 'Phase 6: Enrage',
      partyStatus: PartyStatus.ClearParty,
    },
  },
  [Encounter.UCOB]: {
    Nael: { label: 'Phase 2: Nael', partyStatus: PartyStatus.EarlyProgParty },
    QMT: {
      label: 'Phase 3: Quickmarch Trio',
      partyStatus: PartyStatus.ProgParty,
    },
    BFT: {
      label: 'Phase 3: Blackfire Trio',
      partyStatus: PartyStatus.ProgParty,
    },
    Fellruin: {
      label: 'Phase 3: Fellruin Trio',
      partyStatus: PartyStatus.ProgParty,
    },
    Heavensfall: {
      label: 'Phase 3: Heavensfall Trio',
      partyStatus: PartyStatus.ProgParty,
    },
    Tenstrike: {
      label: 'Phase 3: Tenstrike Trio',
      partyStatus: PartyStatus.ProgParty,
    },
    'Grand Octet': {
      label: 'Phase 3: Grand Octet',
      partyStatus: PartyStatus.ProgParty,
    },
    Adds: { label: 'Phase 4: Adds', partyStatus: PartyStatus.ClearParty },
    'Golden Bahamut': {
      label: 'Phase 5: Golden Bahamut',
      partyStatus: PartyStatus.ClearParty,
    },
    Enrage: {
      label: 'Phase 5: Enrage',
      partyStatus: PartyStatus.ClearParty,
    },
  },
  [Encounter.UWU]: {
    Ifrit: {
      label: 'Phase 2: Ifrit',
      partyStatus: PartyStatus.EarlyProgParty,
    },
    Titan: {
      label: 'Phase 3: Titan',
      partyStatus: PartyStatus.ProgParty,
    },
    Predation: {
      label: 'Phase 4: Predation',
      partyStatus: PartyStatus.ProgParty,
    },
    Annihilation: {
      label: 'Phase 4: Annihilation',
      partyStatus: PartyStatus.ProgParty,
    },
    Suppression: {
      label: 'Phase 4: Suppression',
      partyStatus: PartyStatus.ClearParty,
    },
    'Primal Roulette': {
      label: 'Phase 4: Primal Roulette',
      partyStatus: PartyStatus.ClearParty,
    },
    Enrage: {
      label: 'Phase 4: Enrage',
      partyStatus: PartyStatus.ClearParty,
    },
  },
  [Encounter.FRU]: {
    'Light Rampant': {
      label: 'Phase 2: Light Rampant',
      partyStatus: PartyStatus.ProgParty,
    },
    Adds: {
      label: 'Phase 2: Adds',
      partyStatus: PartyStatus.ProgParty,
    },
    'Ultimate Relativity': {
      label: 'Phase 3: Ultimate Relativity',
      partyStatus: PartyStatus.ProgParty,
    },
    Apocalypse: {
      label: 'Phase 3: Apocalypse',
      partyStatus: PartyStatus.ProgParty,
    },
    Darklit: {
      label: 'Phase 4: Darklit Dragonsong',
      partyStatus: PartyStatus.ProgParty,
    },
    'Crystalize Time': {
      label: 'Phase 4: Crystalize Time',
      partyStatus: PartyStatus.ProgParty,
    },
    'Fulgent 1': {
      label: 'Phase 5: Fulgent Blade 1',
      partyStatus: PartyStatus.ClearParty,
    },
    'Wings 1': {
      label: 'Phase 5: Wings Dark and Light 1',
      partyStatus: PartyStatus.ClearParty,
    },
    'Polar 1': {
      label: 'Phase 5: Polarizing Strikes 1',
      partyStatus: PartyStatus.ClearParty,
    },
    'Fulgent 2': {
      label: 'Phase 5: Fulgent Blade 2',
      partyStatus: PartyStatus.ClearParty,
    },
    'Wings 2': {
      label: 'Phase 5: Wings Dark and Light 2',
      partyStatus: PartyStatus.ClearParty,
    },
    'Polar 2': {
      label: 'Phase 5: Polarizing Strikes 2',
      partyStatus: PartyStatus.ClearParty,
    },
    'Fulgent 3': {
      label: 'Phase 5: Fulgent Blade 3',
      partyStatus: PartyStatus.ClearParty,
    },
    Enrage: {
      label: 'Phase 5: Enrage',
      partyStatus: PartyStatus.ClearParty,
    },
  },
};

export interface EncounterChoice {
  name: string;
  value: Encounter;
  mode: ApplicationMode;
}

// The list of choices to be used in slash commands
export const ENCOUNTER_CHOICES: Readonly<EncounterChoice>[] = [
  {
    name: 'The Omega Protocol (Ultimate)',
    value: Encounter.TOP,
    mode: 'legacy',
  },
  {
    name: 'Dragonsong Reprise (Ultimate)',
    value: Encounter.DSR,
    mode: 'legacy',
  },
  {
    name: 'The Epic of Alexander (Ultimate)',
    value: Encounter.TEA,
    mode: 'legacy',
  },
  {
    name: 'The Weapons Refrain (Ultimate)',
    value: Encounter.UWU,
    mode: 'legacy',
  },
  {
    name: 'The Unending Coil of Bahamut (Ultimate)',
    value: Encounter.UCOB,
    mode: 'legacy',
  },
  {
    name: 'Futures Rewritten (Ultimate)',
    value: Encounter.FRU,
    mode: 'ultimate',
  },
];

export const getEncounterChoicesForMode = (mode: ApplicationModeConfig) =>
  ENCOUNTER_CHOICES.filter((encounter) => mode.includes(encounter.mode));
