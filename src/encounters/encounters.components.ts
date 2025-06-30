// This file has been replaced by encounters-components.service.ts
// The dynamic EncountersComponentsService now handles all prog point component creation

import type { SelectMenuComponentOptionData } from 'discord.js';
import { PartyStatus } from '../firebase/models/signup.model.js';

export const PROG_POINT_SELECT_ID = 'progPointSelect';

export const CLEARED_OPTION = {
  label: 'Cleared',
  value: PartyStatus.Cleared,
} as Readonly<SelectMenuComponentOptionData>;
