import { PartyStatus } from '@ulti-project/shared';
import {
  type SelectMenuComponentOptionData,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  Encounter,
  EncounterProgPoints,
  type ProgPointOption,
} from './encounters.consts.js';

export const PROG_POINT_SELECT_ID = 'progPointSelect';
const progPointMapperFn = ([key, { label }]: [string, ProgPointOption]) => ({
  label,
  value: key,
});

export const CLEARED_OPTION = {
  label: 'Cleared',
  value: PartyStatus.Cleared,
} as Readonly<SelectMenuComponentOptionData>;

export const progPointOptions: Readonly<
  Record<Encounter, SelectMenuComponentOptionData[]>
> = Object.entries(EncounterProgPoints).reduce(
  (acc, [encounter, progPoints]) => {
    acc[encounter as Encounter] = Object.entries(progPoints)
      .map(progPointMapperFn)
      .concat(CLEARED_OPTION);
    return acc;
  },
  {} as Record<Encounter, SelectMenuComponentOptionData[]>,
);

const UCOB_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(progPointOptions.UCOB)
  .setCustomId(PROG_POINT_SELECT_ID);

const UWU_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(progPointOptions.UWU)
  .setCustomId(PROG_POINT_SELECT_ID);

const TEA_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(progPointOptions.TEA)
  .setCustomId(PROG_POINT_SELECT_ID);

const DSR_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(progPointOptions.DSR)
  .setCustomId(PROG_POINT_SELECT_ID);

const TOP_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(progPointOptions.TOP)
  .setCustomId(PROG_POINT_SELECT_ID);

const FRU_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions(progPointOptions.FRU)
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
  FRU: FRU_PROG_POINT_MENU,
};
