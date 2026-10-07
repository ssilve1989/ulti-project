import { PartyStatus } from '@ulti-project/shared';
import {
  type APIEmbed,
  type APIEmbedField,
  Colors,
  codeBlock,
  escapeMarkdown,
  userMention,
} from 'discord.js';
import { jobBadge, type Role, roleOf } from './event-roster.jobs.js';

export interface RosterRow {
  discordId: string;
  /** their name on raid-helper, shown in the table when they have no counted signup */
  raidHelperName: string;
  className: string;
  specName?: string | null;
  /** from their counted signup, if they have one */
  character?: { name: string; world: string };
}

export interface RosterGroup {
  label: string;
  /** the party status of the group's prog point; the trailing groups have none */
  partyStatus?: PartyStatus;
  rows: RosterRow[];
}

/** A monospace table per group, or an embed per group with a column per role */
export type RosterFormat = 'table' | 'list';

/** One message of the roster's reply */
export interface RosterMessage {
  content?: string;
  embeds: APIEmbed[];
}

// Discord's limits
const FIELD_VALUE_LIMIT = 1024;
const FIELDS_PER_EMBED = 25;
const EMBEDS_PER_MESSAGE = 10;
const MESSAGE_CHARACTER_LIMIT = 6000;
const TITLE_LIMIT = 256;

function truncate(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`;
}

const embedSize = ({ title = '', description = '', fields = [] }: APIEmbed) =>
  title.length +
  description.length +
  fields.reduce((sum, { name, value }) => sum + name.length + value.length, 0);

/**
 * Lines as fields: as many lines as fit in each, the first named with the
 * group's count and the rest continuing it
 */
function splitIntoFields(
  { label, rows }: RosterGroup,
  lines: string[],
  value: (chunk: string[]) => string,
): APIEmbedField[] {
  const chunks: string[][] = [];
  for (const line of lines) {
    const current = chunks.at(-1);
    if (current && value([...current, line]).length <= FIELD_VALUE_LIMIT) {
      current.push(line);
    } else {
      chunks.push([line]);
    }
  }

  return chunks.map((chunk, i) => ({
    name: i === 0 ? `${label} (${rows.length})` : `${label} (cont.)`,
    value: value(chunk),
  }));
}

// --- table -----------------------------------------------------------------

interface TableRow {
  name: string;
  world: string;
  job: string;
}

/** Widest a cell prints, so rows stay narrow enough not to wrap */
const MAX_WIDTH = Object.freeze({ name: 20, world: 12, job: 12 });
const HEADER: TableRow = Object.freeze({
  name: 'Name',
  world: 'World',
  job: 'Class',
});

/** A cell as it prints: names come from members, and a backtick could close the code block */
function cell(text: string, width: number): string {
  return truncate(text.replaceAll('`', 'ˋ'), width);
}

/** The header line, then a line per row, with columns padded to their widest cell */
function tableLines(rows: RosterRow[]): [string, ...string[]] {
  const tableRows = rows.map(
    ({ raidHelperName, className, specName, character }): TableRow => ({
      name: character?.name ?? raidHelperName,
      world: character?.world ?? '-',
      job: specName || className,
    }),
  );
  const cells = [HEADER, ...tableRows].map(({ name, world, job }) => ({
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

/** A group's table, repeating its header in each field */
function tableFields(group: RosterGroup): APIEmbedField[] {
  const [header, ...lines] = tableLines(group.rows);
  return splitIntoFields(group, lines, (chunk) =>
    codeBlock([header, ...chunk].join('\n')),
  );
}

interface EmbedInProgress {
  title: string;
  description?: string;
  fields: APIEmbedField[];
}

/** One embed per message, each group a field (or several) */
function tableMessages(
  title: string,
  description: string,
  groups: RosterGroup[],
): [RosterMessage, ...RosterMessage[]] {
  let current: EmbedInProgress = {
    title: truncate(title, TITLE_LIMIT),
    description,
    fields: [],
  };
  const embeds: [APIEmbed, ...APIEmbed[]] = [current];

  for (const field of groups.flatMap(tableFields)) {
    if (
      current.fields.length === FIELDS_PER_EMBED ||
      embedSize(current) + field.name.length + field.value.length >
        MESSAGE_CHARACTER_LIMIT
    ) {
      current = {
        title: truncate(`${title} (cont.)`, TITLE_LIMIT),
        fields: [],
      };
      embeds.push(current);
    }
    current.fields.push(field);
  }

  const [first, ...rest] = embeds;
  return [{ embeds: [first] }, ...rest.map((embed) => ({ embeds: [embed] }))];
}

// --- list ------------------------------------------------------------------

const PARTY_STYLE: Readonly<
  Record<PartyStatus, { emoji: string; color: number }>
> = Object.freeze({
  [PartyStatus.EarlyProgParty]: { emoji: '🌱', color: Colors.Green },
  [PartyStatus.ProgParty]: { emoji: '🔥', color: Colors.Orange },
  [PartyStatus.ClearParty]: { emoji: '⚔️', color: Colors.Red },
  [PartyStatus.Cleared]: { emoji: '✅', color: Colors.Gold },
});
/** The style of the groups without a prog point */
const UNRANKED_STYLE = Object.freeze({ emoji: '❔', color: Colors.Grey });

const COLUMNS: readonly { role: Role; name: string }[] = Object.freeze([
  { role: 'tank', name: '🛡️ Tanks' },
  { role: 'healer', name: '💚 Healers' },
  { role: 'dps', name: '⚔️ DPS' },
]);
const OTHER_NAME = '🔄 Flex / Other';
/** Discord needs a value in every field, and an empty column keeps the grid */
const NO_ONE = '—';
/** Indents a character under their mention (Discord trims leading spaces) */
const EM_SPACE = ' ';

/** Capitalizes each word, as names are stored lowercase */
function titleCase(text: string): string {
  return text.replace(
    /(^|[\s-])(\p{L})/gu,
    (_, before: string, letter: string) => before + letter.toUpperCase(),
  );
}

/** `Character @ World`, title-cased and escaped so it can't change the formatting */
function characterText({ name, world }: { name: string; world: string }) {
  return escapeMarkdown(`${titleCase(name)} @ ${titleCase(world)}`, {
    maskedLink: true,
  });
}

function badge(row: RosterRow): string {
  return `\`${jobBadge(row).replaceAll('`', 'ˋ')}\` ${userMention(row.discordId)}`;
}

/** A member in a role column: their badge and mention, with their character underneath */
function columnEntry(row: RosterRow): string {
  return row.character
    ? `${badge(row)}\n${EM_SPACE}${characterText(row.character)}`
    : badge(row);
}

/** A member without a role, on one line under the columns */
function otherEntry(row: RosterRow): string {
  return row.character
    ? `${badge(row)} — ${characterText(row.character)}`
    : badge(row);
}

function columnFields(rows: RosterRow[]): APIEmbedField[] {
  const fields: APIEmbedField[] = COLUMNS.map(({ role, name }) => ({
    name,
    value:
      rows
        .filter(({ className }) => roleOf(className) === role)
        .map(columnEntry)
        .join('\n') || NO_ONE,
    inline: true,
  }));
  const others = rows.filter(({ className }) => roleOf(className) === 'other');
  if (others.length > 0) {
    fields.push({
      name: OTHER_NAME,
      value: others.map(otherEntry).join('\n'),
      inline: false,
    });
  }
  return fields;
}

/** A group's embeds: one, unless a column passes a field's limit and continues in another */
function groupEmbeds(group: RosterGroup): APIEmbed[] {
  const { emoji, color } = group.partyStatus
    ? PARTY_STYLE[group.partyStatus]
    : UNRANKED_STYLE;
  const fits = (rows: RosterRow[]) =>
    columnFields(rows).every(({ value }) => value.length <= FIELD_VALUE_LIMIT);

  const batches: RosterRow[][] = [];
  for (const row of group.rows) {
    const current = batches.at(-1);
    if (current && fits([...current, row])) {
      current.push(row);
    } else {
      batches.push([row]);
    }
  }

  return batches.map((rows, i) => ({
    title: truncate(
      `${emoji} ${group.label} ${i === 0 ? `(${group.rows.length})` : '(cont.)'}`,
      TITLE_LIMIT,
    ),
    color,
    fields: columnFields(rows),
  }));
}

/** A summary line, then the groups' embeds, as many per message as Discord allows */
function listMessages(
  title: string,
  description: string,
  groups: RosterGroup[],
): [RosterMessage, ...RosterMessage[]] {
  const rows = groups.flatMap((group) => group.rows);
  const approved = rows.filter(({ character }) => character).length;
  let current: RosterMessage = {
    content: `**${escapeMarkdown(truncate(title, TITLE_LIMIT), { maskedLink: true })}** — ${description} · ${rows.length} signed up · ${approved} approved`,
    embeds: [],
  };
  let currentSize = 0;
  const messages: [RosterMessage, ...RosterMessage[]] = [current];

  for (const embed of groups.flatMap(groupEmbeds)) {
    if (
      current.embeds.length === EMBEDS_PER_MESSAGE ||
      currentSize + embedSize(embed) > MESSAGE_CHARACTER_LIMIT
    ) {
      current = { embeds: [] };
      currentSize = 0;
      messages.push(current);
    }
    current.embeds.push(embed);
    currentSize += embedSize(embed);
  }

  return messages;
}

/** The roster's reply, as the messages to send in order */
export function rosterMessages({
  title,
  description,
  groups,
  format,
}: {
  title: string;
  description: string;
  groups: RosterGroup[];
  format: RosterFormat;
}): [RosterMessage, ...RosterMessage[]] {
  return format === 'list'
    ? listMessages(title, description, groups)
    : tableMessages(title, description, groups);
}
