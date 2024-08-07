import { StringSelectMenuBuilder } from 'discord.js';
import { PartyStatus } from '../firebase/models/signup.model.js';
import {
  Encounter,
  EncounterProgPoints,
  ProgPointOption,
} from './encounters.consts.js';

export const PROG_POINT_SELECT_ID = 'progPointSelect';
const progPointMapperFn = ([key, { label }]: [string, ProgPointOption]) => ({
  label,
  value: key,
});

const clearedOption = {
  label: 'Cleared',
  value: PartyStatus.Cleared,
};

// TODO: consolidate these t progPointOptions assignments to a single reduce over EncounterProgPoints
const ucobProgOptions = Object.entries(EncounterProgPoints[Encounter.UCOB]).map(
  progPointMapperFn,
);

const uwuProgOptions = Object.entries(EncounterProgPoints[Encounter.UWU]).map(
  progPointMapperFn,
);

const teaProgOptions = Object.entries(EncounterProgPoints[Encounter.TEA]).map(
  progPointMapperFn,
);

const dsrProgOptions = Object.entries(EncounterProgPoints[Encounter.DSR]).map(
  progPointMapperFn,
);

const topProgOptions = Object.entries(EncounterProgPoints[Encounter.TOP]).map(
  progPointMapperFn,
);

const m1sProgOptions = Object.entries(EncounterProgPoints[Encounter.M1S]).map(
  progPointMapperFn,
);

const m2sProgOptions = Object.entries(EncounterProgPoints[Encounter.M2S]).map(
  progPointMapperFn,
);

const m3sProgOptions = Object.entries(EncounterProgPoints[Encounter.M3S]).map(
  progPointMapperFn,
);

const m4sProgOptions = Object.entries(EncounterProgPoints[Encounter.M4S]).map(
  progPointMapperFn,
);

const UCOB_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(...ucobProgOptions, clearedOption)
  .setCustomId(PROG_POINT_SELECT_ID);

const UWU_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(...uwuProgOptions, clearedOption)
  .setCustomId(PROG_POINT_SELECT_ID);

const TEA_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(...teaProgOptions, clearedOption)
  .setCustomId(PROG_POINT_SELECT_ID);

const DSR_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(...dsrProgOptions, clearedOption)
  .setCustomId(PROG_POINT_SELECT_ID);

const TOP_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(...topProgOptions, clearedOption)
  .setCustomId(PROG_POINT_SELECT_ID);

const M1S_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(...m1sProgOptions, clearedOption)
  .setCustomId(PROG_POINT_SELECT_ID);

const M2S_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(...m2sProgOptions, clearedOption)
  .setCustomId(PROG_POINT_SELECT_ID);

const M3S_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(...m3sProgOptions, clearedOption)
  .setCustomId(PROG_POINT_SELECT_ID);

const M4S_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(...m4sProgOptions, clearedOption)
  .setCustomId(PROG_POINT_SELECT_ID);

/**
 * A map of encounters to their respective progression point select menus
 * Only one menu should be used at once for a select menu interaction as they all share
 * the same custom ID
 */
export const EncounterProgMenus: Record<Encounter, StringSelectMenuBuilder> = {
  UCOB: UCOB_PROG_POINT_MENU,
  UWU: UWU_PROG_POINT_MENU,
  TEA: TEA_PROG_POINT_MENU,
  DSR: DSR_PROG_POINT_MENU,
  TOP: TOP_PROG_POINT_MENU,
  M1S: M1S_PROG_POINT_MENU,
  M2S: M2S_PROG_POINT_MENU,
  M3S: M3S_PROG_POINT_MENU,
  M4S: M4S_PROG_POINT_MENU,
};
