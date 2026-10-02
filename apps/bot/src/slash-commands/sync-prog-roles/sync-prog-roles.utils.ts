import type { APIEmbedField } from 'discord.js';

const MAX_FIELD_LENGTH = 1024;
const MAX_DETAIL_FIELDS = 5;
// room for "\n… and 99999 more"
const MORE_MARKER_RESERVE = 24;

function packLines(
  details: string[],
  startIndex: number,
  budget: number,
): { lines: string[]; nextIndex: number } {
  const lines: string[] = [];
  let length = 0;
  let index = startIndex;

  while (index < details.length) {
    const line = details[index];
    const lineLength = line.length + (lines.length > 0 ? 1 : 0);
    if (length + lineLength > budget) {
      break;
    }
    lines.push(line);
    length += lineLength;
    index++;
  }

  return { lines, nextIndex: index };
}

/**
 * Packs change lines into embed fields within Discord's field length, up to
 * MAX_DETAIL_FIELDS; the last one says how many lines didn't fit.
 */
export function buildDetailFields(details: string[]): APIEmbedField[] {
  const fields: APIEmbedField[] = [];
  let index = 0;

  while (index < details.length && fields.length < MAX_DETAIL_FIELDS) {
    const isLastField = fields.length === MAX_DETAIL_FIELDS - 1;
    const budget = isLastField
      ? MAX_FIELD_LENGTH - MORE_MARKER_RESERVE
      : MAX_FIELD_LENGTH;

    const { lines, nextIndex } = packLines(details, index, budget);
    index = nextIndex;

    if (lines.length === 0) {
      break;
    }

    const remaining = details.length - index;
    const value =
      isLastField && remaining > 0
        ? `${lines.join('\n')}\n… and ${remaining} more`
        : lines.join('\n');

    fields.push({
      name: fields.length === 0 ? 'Changes' : 'Changes (cont.)',
      value,
      inline: false,
    });
  }

  return fields;
}
