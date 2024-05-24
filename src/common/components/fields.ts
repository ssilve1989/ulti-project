import { APIEmbedField } from 'discord.js';
import { titleCase } from 'title-case';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../encounters/encounters.consts.js';

export const characterField = (value: string): APIEmbedField => ({
  name: 'Character',
  value: titleCase(value),
  inline: true,
});

export const worldField = (value: string): APIEmbedField => ({
  name: 'World',
  value: titleCase(value),
  inline: true,
});

export const encounterField = (value: Encounter): APIEmbedField => ({
  name: 'Encounter',
  value: EncounterFriendlyDescription[value],
  inline: true,
});
