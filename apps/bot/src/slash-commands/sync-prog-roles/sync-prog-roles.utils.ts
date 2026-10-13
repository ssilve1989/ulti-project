import type { APIEmbedField } from 'discord.js';
import { chunkLines } from '../../common/embed-helpers.js';

const MAX_FIELD_LENGTH = 1024;
const MAX_DETAIL_FIELDS = 5;
// room for "\n… and 99999 more"
const MORE_MARKER_RESERVE = 24;

/**
 * Packs change lines into embed fields within Discord's field length, up to
 * MAX_DETAIL_FIELDS; the last one says how many lines didn't fit.
 */
export function buildDetailFields(details: string[]): APIEmbedField[] {
  const head = chunkLines(details, MAX_FIELD_LENGTH).slice(
    0,
    MAX_DETAIL_FIELDS - 1,
  );
  const rest = details.slice(head.flat().length);
  const [last = []] = chunkLines(rest, MAX_FIELD_LENGTH - MORE_MARKER_RESERVE);
  const left = rest.length - last.length;
  const values = head.map((lines) => lines.join('\n'));
  if (last.length > 0) {
    values.push(
      left > 0 ? `${last.join('\n')}\n… and ${left} more` : last.join('\n'),
    );
  }
  return values.map((value, index) => ({
    name: index === 0 ? 'Changes' : 'Changes (cont.)',
    value,
    inline: false,
  }));
}
