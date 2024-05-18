import { StringSelectMenuBuilder } from 'discord.js';
import { PartyStatus } from '../firebase/models/signup.model.js';
import { Encounter, EncounterProgPoints } from './encounters.consts.js';

export const PROG_POINT_SELECT_ID = 'progPointSelect';

const clearedOption = {
  label: 'Cleared',
  value: PartyStatus.Cleared,
};

const ucobProgOptions = Object.entries(EncounterProgPoints[Encounter.UCOB]).map(
  ([key, { label }]) => ({
    label,
    value: key,
  }),
);

const uwuProgOptions = Object.entries(EncounterProgPoints[Encounter.UWU]).map(
  ([key, { label }]) => ({
    label,
    value: key,
  }),
);

const teaProgOptions = Object.entries(EncounterProgPoints[Encounter.TEA]).map(
  ([key, { label }]) => ({
    label,
    value: key,
  }),
);

const dsrProgOptions = Object.entries(EncounterProgPoints[Encounter.DSR]).map(
  ([key, { label }]) => ({
    label,
    value: key,
  }),
);

const topProgOptions = Object.entries(EncounterProgPoints[Encounter.TOP]).map(
  ([key, { label }]) => ({
    label,
    value: key,
  }),
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
};
