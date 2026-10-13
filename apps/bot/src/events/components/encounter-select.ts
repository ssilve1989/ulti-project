import {
  type Encounter,
  getEncounterChoicesForMode,
} from '@ulti-project/shared';
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { appConfig } from '../../config/app.js';

/** The encounter menu's `customId`; each panel's collector is scoped to its own message. */
export const EVENT_ENCOUNTERS_SELECT_ID = 'eventEncounters';

const choices = () => getEncounterChoicesForMode(appConfig.APPLICATION_MODE);

/** A menu of the mode's encounters, in mode order, with `selected` pre-selected. */
export function encounterSelect(
  customId: string,
  selected: readonly Encounter[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = choices();
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Choose encounters')
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(
        options.map(({ name, value }) => ({
          label: name,
          value,
          default: selected.includes(value),
        })),
      ),
  );
}

/** The mode's encounters among `values`, once each, in mode order. */
export function readEncounterSelection(values: readonly string[]): Encounter[] {
  return choices()
    .map(({ value }) => value)
    .filter((encounter) => values.includes(encounter));
}
