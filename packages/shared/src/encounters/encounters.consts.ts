import type {
  ApplicationMode,
  ApplicationModeConfig,
} from '../config/app-types.ts';
import { PartyStatus } from '../firebase/models/signup.model.ts';

export const Encounter = {
  TOP: 'TOP',
  UWU: 'UWU',
  UCOB: 'UCOB',
  TEA: 'TEA',
  DSR: 'DSR',
  FRU: 'FRU',
  DMU: 'DMU',
} as const;

export type Encounter = (typeof Encounter)[keyof typeof Encounter];

export function isEncounter(value: string): value is Encounter {
  return Object.values(Encounter).some((encounter) => encounter === value);
}

export const EncounterFriendlyDescription = Object.freeze({
  [Encounter.TOP]: '[TOP] The Omega Protocol',
  [Encounter.UWU]: '[UwU] The Weapons Refrain',
  [Encounter.UCOB]: '[UCoB] The Unending Coil of Bahamut',
  [Encounter.TEA]: '[TEA] The Epic of Alexander',
  [Encounter.DSR]: '[DSR] Dragonsong Reprise',
  [Encounter.FRU]: '[FRU] Futures Rewritten',
  [Encounter.DMU]: 'Dancing Mad (Ultimate)',
});

// prog point lookup hash for each encounter and what party type the prog point belongs to
// along with their label for the slash command options
export type ProgPointOption = {
  label: string;
  partyStatus: PartyStatus;
};

interface EncounterChoice {
  name: string;
  value: Encounter;
  mode: ApplicationMode;
}

// The list of choices to be used in slash commands
const ENCOUNTER_CHOICES: Readonly<EncounterChoice>[] = [
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
    mode: 'legacy',
  },
  {
    name: 'Dancing Mad (Ultimate)',
    value: Encounter.DMU,
    mode: 'ultimate',
  },
];

export const getEncounterChoicesForMode = (mode: ApplicationModeConfig) =>
  ENCOUNTER_CHOICES.filter((encounter) => mode.includes(encounter.mode));
