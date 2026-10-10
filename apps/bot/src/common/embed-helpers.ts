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

/**
 * `lines` in order, cut into runs that each fit `budget` characters once
 * joined with newlines, e.g. for embed field values. A longer line runs alone.
 */
export function chunkLines(
  lines: readonly string[],
  budget: number,
): string[][] {
  const chunks: string[][] = [];
  let chunk: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (chunk.length > 0 && size + 1 + line.length > budget) {
      chunks.push(chunk);
      chunk = [];
    }
    size = chunk.length > 0 ? size + 1 + line.length : line.length;
    chunk.push(line);
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}
