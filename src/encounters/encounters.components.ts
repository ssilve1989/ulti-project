import type { SelectMenuComponentOptionData } from 'discord.js';
import { PartyStatus } from '../firebase/models/signup.model.js';

export const PROG_POINT_SELECT_ID = 'progPointSelect';

export const CLEARED_OPTION = {
  label: 'Cleared',
  value: PartyStatus.Cleared,
} as Readonly<SelectMenuComponentOptionData>;
