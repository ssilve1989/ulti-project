import {
  ButtonBuilder,
  ButtonStyle,
  type SelectMenuComponentOptionData,
  StringSelectMenuBuilder,
} from 'discord.js';
import type { ApplicationModeConfig } from '../../app.config.js';
import {
  Encounter,
  EncounterProgPoints,
  getEncounterChoicesForMode,
} from '../../encounters/encounters.consts.js';

export const ENCOUNTER_SELECT_ID = 'searchEncounterSelect';
export const PROG_POINT_SELECT_ID = 'searchProgPointSelect';
export const RESET_BUTTON_ID = 'searchResetButton';

// Create select menu options for encounters based on application mode
export const getEncounterOptions = (
  mode: ApplicationModeConfig,
): SelectMenuComponentOptionData[] => {
  const choices = getEncounterChoicesForMode(mode);
  return choices.map((choice) => ({
    label: choice.name,
    value: choice.value,
  }));
};

// Create the encounter select menu with application mode filtering
export const createEncounterSelectMenu = (mode: ApplicationModeConfig) =>
  new StringSelectMenuBuilder()
    .setCustomId(ENCOUNTER_SELECT_ID)
    .setPlaceholder('Select an encounter')
    .addOptions(getEncounterOptions(mode));

// Create the prog point select menu for a specific encounter
export const createProgPointSelectMenu = (encounter: Encounter) => {
  const progPoints = EncounterProgPoints[encounter];
  const options = Object.entries(progPoints).map(([value, { label }]) => ({
    label,
    value,
  }));

  return new StringSelectMenuBuilder()
    .setCustomId(PROG_POINT_SELECT_ID)
    .setPlaceholder('Select a prog point')
    .addOptions(options);
};

// Create reset button
export const createResetButton = () =>
  new ButtonBuilder()
    .setCustomId(RESET_BUTTON_ID)
    .setLabel('Reset Search')
    .setStyle(ButtonStyle.Secondary);
