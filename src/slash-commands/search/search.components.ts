import {
  ButtonBuilder,
  ButtonStyle,
  type SelectMenuComponentOptionData,
  StringSelectMenuBuilder,
} from 'discord.js';
import type { ApplicationModeConfig } from '../../app.config.js';
import {
  getEncounterChoicesForMode,
  type ProgPointOption,
} from '../../encounters/encounters.consts.js';

export const SEARCH_ENCOUNTER_SELECTOR_ID = 'searchEncounterSelect';
export const SEARCH_PROG_POINT_SELECT_ID = 'searchProgPointSelect';
export const SEARCH_RESET_BUTTON_ID = 'searchResetButton';

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

// TODO: This should use the active encounters from the encounters collection.
// Create the encounter select menu with application mode filtering
export const createEncounterSelectMenu = (mode: ApplicationModeConfig) =>
  new StringSelectMenuBuilder()
    .setCustomId(SEARCH_ENCOUNTER_SELECTOR_ID)
    .setPlaceholder('Select an encounter')
    .addOptions(getEncounterOptions(mode));

// Create the prog point select menu for a specific encounter
export const createProgPointSelectMenu = (
  progPointOptions: Record<string, ProgPointOption>,
) => {
  const options = Object.entries(progPointOptions).map(
    ([value, { label }]) => ({
      label,
      value,
    }),
  );

  return new StringSelectMenuBuilder()
    .setCustomId(SEARCH_PROG_POINT_SELECT_ID)
    .setPlaceholder('Select a prog point')
    .addOptions(options);
};

// Create reset button
export const createResetButton = () =>
  new ButtonBuilder()
    .setCustomId(SEARCH_RESET_BUTTON_ID)
    .setLabel('Reset Search')
    .setStyle(ButtonStyle.Secondary);
