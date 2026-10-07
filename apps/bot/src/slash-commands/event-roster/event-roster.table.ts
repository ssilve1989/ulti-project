import { type APIEmbed, type APIEmbedField, codeBlock } from 'discord.js';

export interface RosterRow {
  name: string;
  world: string;
  job: string;
}

export interface RosterGroup {
  label: string;
  rows: RosterRow[];
}

// Discord's limits
const FIELD_VALUE_LIMIT = 1024;
const FIELDS_PER_EMBED = 25;
const MESSAGE_CHARACTER_LIMIT = 6000;
const TITLE_LIMIT = 256;

/** Widest a cell prints, so rows stay narrow enough not to wrap */
const MAX_WIDTH = Object.freeze({ name: 20, world: 12, job: 12 });
const HEADER: RosterRow = Object.freeze({
  name: 'Name',
  world: 'World',
  job: 'Class',
});

function truncate(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`;
}

/** A cell as it prints: names come from members, and a backtick could close the code block */
function cell(text: string, width: number): string {
  return truncate(text.replaceAll('`', 'ˋ'), width);
}

/** The header line, then a line per row, with columns padded to their widest cell */
function tableLines(rows: RosterRow[]): [string, ...string[]] {
  const cells = [HEADER, ...rows].map(({ name, world, job }) => ({
    name: cell(name, MAX_WIDTH.name),
    world: cell(world, MAX_WIDTH.world),
    job: cell(job, MAX_WIDTH.job),
  }));
  const nameWidth = Math.max(...cells.map(({ name }) => name.length));
  const worldWidth = Math.max(...cells.map(({ world }) => world.length));
  const [header, ...lines] = cells.map(
    ({ name, world, job }) =>
      `${name.padEnd(nameWidth)}  ${world.padEnd(worldWidth)}  ${job}`,
  );
  // cells always holds HEADER; this only satisfies noUncheckedIndexedAccess
  return [header ?? '', ...lines];
}

/** A group's table, continued in further fields when it's too long for one */
function groupFields({ label, rows }: RosterGroup): APIEmbedField[] {
  const [header, ...lines] = tableLines(rows);
  const table = (chunk: string[]) => codeBlock([header, ...chunk].join('\n'));

  const chunks: string[][] = [];
  for (const line of lines) {
    const current = chunks.at(-1);
    if (current && table([...current, line]).length <= FIELD_VALUE_LIMIT) {
      current.push(line);
    } else {
      chunks.push([line]);
    }
  }

  return chunks.map((chunk, i) => ({
    name: i === 0 ? `${label} (${rows.length})` : `${label} (cont.)`,
    value: table(chunk),
  }));
}

const fieldSize = ({ name, value }: APIEmbedField) =>
  name.length + value.length;

interface EmbedInProgress {
  title: string;
  description?: string;
  fields: APIEmbedField[];
}

/**
 * The roster as embeds, one per message: each group a field (or several), and
 * a new embed whenever the next field would pass Discord's limits.
 */
export function rosterEmbeds({
  title,
  description,
  groups,
}: {
  title: string;
  description: string;
  groups: RosterGroup[];
}): [APIEmbed, ...APIEmbed[]] {
  let current: EmbedInProgress = {
    title: truncate(title, TITLE_LIMIT),
    description,
    fields: [],
  };
  let currentSize = current.title.length + description.length;
  const embeds: [APIEmbed, ...APIEmbed[]] = [current];

  for (const field of groups.flatMap(groupFields)) {
    if (
      current.fields.length === FIELDS_PER_EMBED ||
      currentSize + fieldSize(field) > MESSAGE_CHARACTER_LIMIT
    ) {
      current = {
        title: truncate(`${title} (cont.)`, TITLE_LIMIT),
        fields: [],
      };
      currentSize = current.title.length;
      embeds.push(current);
    }
    current.fields.push(field);
    currentSize += fieldSize(field);
  }

  return embeds;
}
