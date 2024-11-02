import type { APIEmbedField } from 'discord.js';

type MaybeField = Omit<APIEmbedField, 'value'> & { value?: string | null };

export function createFields(fields: MaybeField[]): APIEmbedField[] {
  return fields.filter((field): field is APIEmbedField => !!field.value);
}
