import { type APIEmbedField, userMention } from 'discord.js';
import { titleCase } from 'title-case';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../encounters/encounters.consts.js';

export const characterField = (
  character: string,
  { name = 'Character', memberId }: { name?: string; memberId?: string } = {},
): APIEmbedField => {
  const value = memberId
    ? `${titleCase(character)} (${userMention(memberId)})`
    : titleCase(character);
  return {
    name,
    value,
    inline: true,
  };
};

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

export const emptyField = () => ({
  name: '\u200b',
  value: '\u200b',
  inline: true,
});
