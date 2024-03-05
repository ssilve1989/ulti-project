import { StringSelectMenuBuilder } from 'discord.js';
import { Encounter } from './encounters.consts.js';

export const PROG_POINT_SELECT_ID = 'progPointSelect';

const UCOB_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions([
    { label: 'Phase 2: Nael', value: 'Nael' },
    { label: 'Phase 3: Quickmarch Trio', value: 'QMT' },
    { label: 'Phase 3: Blackfire Trio', value: 'BFT' },
    { label: 'Phase 3: Fellruin Trio', value: 'Fellruin' },
    { label: 'Phase 3: Heavensfall Trio', value: 'Heavensfall' },
    { label: 'Phase 3: Tenstrike Trio', value: 'Tenstrike' },
    { label: 'Phase 3: Grand Octet', value: 'Grand Octet' },
    { label: 'Phase 4: Adds', value: 'adds' },
    { label: 'Phase 5: Golden Bahamut', value: 'Golden' },
  ])
  .setCustomId(PROG_POINT_SELECT_ID);

const UWU_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions([
    { label: 'Phase 3: Titan', value: 'Titan' },
    { label: 'Phase 4: Predation', value: 'Predation' },
    { label: 'Phase 4: Annihilation', value: 'Annihilation' },
    { label: 'Phase 4: Suppression', value: 'Suppression' },
    { label: 'Phase 4: Primal Roulette', value: 'Primal Roulette' },
  ])
  .setCustomId(PROG_POINT_SELECT_ID);

const TEA_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions([
    { label: 'Phase 2: BJCC', value: 'BJCC' },
    { label: 'Phase 3: Time Stop', value: 'Time Stop' },
    { label: 'Phase 3: Inception', value: 'Inception' },
    { label: 'Phase 3: Wormhole', value: 'Wormhole' },
    { label: 'Phase 4: Final Word', value: 'Final Word' },
    { label: 'Phase 4: Fate Calibration (Alpha)', value: 'Fate Cal A' },
    { label: 'Phase 4: Fate Calibration (Beta)', value: 'Fate Cal B' },
    { label: 'Phase 4: Trines', value: 'Trines' },
  ])
  .setCustomId(PROG_POINT_SELECT_ID);

const DSR_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions([
    { label: 'Phase 3: Nidhogg', value: 'Nidhogg' },
    { label: 'Phase 4: Eyes', value: 'Eyes' },
    { label: 'Phase 4: Rewind', value: 'Rewind' },
    { label: 'Phase 5: Wrath of the Heavens', value: 'WOTH' },
    { label: 'Phase 5: Death of the Heavens', value: 'DOTH' },
    { label: 'Phase 6: Wyrmsbreath 1', value: 'WB1' },
    { label: 'Phase 6: Wroth Flames', value: 'WROTH' },
    { label: 'Phase 6: Wyrmsbreath 2', value: 'WB2' },
    { label: 'Phase 6: Enrage', value: 'P6 Enrage' },
    { label: 'Phase 7: Akh Morn 1', value: 'AM1' },
    { label: 'Phase 7: Gigaflare 1', value: 'Gigaflare 1' },
    { label: 'Phase 7: Akh Morn 2', value: 'AM2' },
    { label: 'Phase 7: Gigaflare 2', value: 'Gigaflare 2' },
    { label: 'Phase 7: Akh Morn 3', value: 'AM3' },
    { label: 'Phase 7: Enrage', value: 'P7 Enrage' },
  ])
  .setCustomId(PROG_POINT_SELECT_ID);

const TOP_PROG_POINT_MENU = new StringSelectMenuBuilder()
  .addOptions([
    { label: 'Phase 4: Blue Screen', value: 'P4' },
    { label: 'Phase 5: Delta', value: 'P5 Delta' },
    { label: 'Phase 5: Sigma', value: 'P5 Sigma' },
    { label: 'Phase 5: Omega', value: 'P5 Omega' },
    { label: 'Phase 5: Enrage', value: 'P5 Enrage' },
    { label: 'Phase 6: Exasquares 1', value: 'P6 Exas 1' },
    { label: 'Phase 6: Cosmo Dive 1', value: 'P6 Cosmo Dive 1' },
    { label: 'Phase 6: Wave Cannon 1', value: 'P6 WC 1' },
    { label: 'Phase 6: Exasquares 2', value: 'P6 Exas 2' },
    { label: 'Phase 6: Wave Cannon 2', value: 'P6 WC 2' },
    { label: 'Phase 6: Cosmo Dive 2', value: 'P6 Cosmo Dive 2' },
    { label: 'Phase 6: Cosmo Meteor', value: 'P6 Cosmo Meteor' },
    { label: 'Phase 6: Enrage', value: 'P6 Enrage' },
  ])
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
