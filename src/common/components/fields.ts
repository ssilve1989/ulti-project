import type { APIEmbedField } from 'discord.js';
import { titleCase } from 'title-case';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../encounters/encounters.consts.js';

export const characterField = (
  value: string,
  name = 'Character',
): APIEmbedField => ({
  name,
  value: titleCase(value),
  inline: true,
});

export const worldField = (value: string, name = 'World'): APIEmbedField => ({
  name,
  value: titleCase(value),
  inline: true,
});

export const encounterField = (
  value: Encounter,
  name = 'Encounter',
): APIEmbedField => ({
  name,
  value: EncounterFriendlyDescription[value],
  inline: true,
});
