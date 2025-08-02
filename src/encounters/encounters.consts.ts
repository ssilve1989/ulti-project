import type { ApplicationMode, ApplicationModeConfig } from '../config/app.js';
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
