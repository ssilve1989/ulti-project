import type { APIEmbedField } from 'discord.js';

type WithTransform<T> = T & { transform?: (value: string) => string };

type MaybeField = Omit<APIEmbedField, 'value'> &
  WithTransform<{
    value?: string | null;
  }>;

export function createFields(fields: MaybeField[]): APIEmbedField[] {
  return fields
    .filter((field): field is WithTransform<APIEmbedField> => !!field.value)
    .map(({ transform, ...field }) =>
      transform ? { ...field, value: transform(field.value) } : field,
    );
}
