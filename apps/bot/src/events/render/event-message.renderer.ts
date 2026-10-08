import {
  type Encounter,
  JOB_ROLE,
  JOB_ROLE_ORDER,
  type Job,
} from '@ulti-project/shared';
import {
  type ActionRowBuilder,
  type ButtonBuilder,
  EmbedBuilder,
  TimestampStyles,
  time,
  userMention,
} from 'discord.js';
import { titleCase } from 'title-case';
import {
  EventStatus,
  type ParticipantDocument,
  type StoredEvent,
} from '../../firebase/models/event.model.js';

// Discord's embed limits
const MAX_FIELD_VALUE = 1024;
const MAX_FIELDS = 25;
const MAX_EMBED_SIZE = 6000;
const MAX_EMBEDS = 10;

export interface EventMessageInput {
  event: StoredEvent;
  participants: readonly ParticipantDocument[];
  jobEmojis: Partial<Record<Job, string>>;
  encounterNames: Readonly<Record<Encounter, string>>;
  now: Date;
}

export interface EventMessage {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

interface EmbedHeader {
  title: string;
  description: string;
}

interface Field {
  name: string;
  value: string;
  /** How many sign-ups the field lists. */
  count: number;
}

type Phase = ParticipantDocument['phase'];

export function renderEventMessage({
  event,
  participants,
  jobEmojis,
  encounterNames,
}: EventMessageInput): EventMessage {
  const fields = event.encounters.flatMap((encounter) =>
    encounterFields(
      encounterNames[encounter],
      participants.filter((participant) => participant.encounter === encounter),
      jobEmojis,
    ),
  );
  const header = { title: event.title, description: describe(event) };
  return { embeds: packEmbeds(header, fields), components: [] };
}

export function jobBadge(
  job: Job,
  jobEmojis: Partial<Record<Job, string>>,
): string {
  const emojiId = jobEmojis[job];
  return emojiId ? `<:${job}:${emojiId}>` : `\`${job}\``;
}

function describe(event: StoredEvent): string {
  const startsAt = event.startsAt.toDate();
  const lines = [
    `${time(startsAt, TimestampStyles.LongDateTime)} (${time(startsAt, TimestampStyles.RelativeTime)})`,
    signupsLine(event),
    `Organized by ${userMention(event.createdBy)}`,
  ];
  return lines.filter((line) => line !== undefined).join('\n');
}

function signupsLine(event: StoredEvent): string | undefined {
  switch (event.status) {
    case EventStatus.Closed:
      return 'Closed';
    case EventStatus.SignupsClosed:
      return 'Sign-ups closed';
    case EventStatus.Open:
      return event.signupsCloseAt.isEqual(event.startsAt)
        ? undefined
        : `Sign-ups close ${time(event.signupsCloseAt.toDate(), TimestampStyles.RelativeTime)}`;
  }
}

function encounterFields(
  name: string,
  participants: readonly ParticipantDocument[],
  jobEmojis: Partial<Record<Job, string>>,
): Field[] {
  const header: Field = {
    name: `__${name}__`,
    value: participants.length
      ? `${participants.length} signed up`
      : 'No sign-ups yet',
    count: 0,
  };
  const phases = groupByPhase(participants).sort(
    (a, b) => b.phase.order - a.phase.order,
  );
  return [
    header,
    ...phases.flatMap(({ phase, members }) =>
      splitField(
        `${phase.label} (${members.length})`,
        members
          .sort(byRoleThenSignup)
          .map((member) => participantLine(member, jobEmojis)),
      ),
    ),
  ];
}

function groupByPhase(participants: readonly ParticipantDocument[]) {
  const groups = new Map<
    string,
    { phase: Phase; members: ParticipantDocument[] }
  >();
  for (const participant of participants) {
    const group = groups.get(participant.phase.roleId);
    if (group) {
      group.members.push(participant);
    } else {
      groups.set(participant.phase.roleId, {
        phase: participant.phase,
        members: [participant],
      });
    }
  }
  return [...groups.values()];
}

function byRoleThenSignup(
  a: ParticipantDocument,
  b: ParticipantDocument,
): number {
  return (
    JOB_ROLE_ORDER[JOB_ROLE[a.job]] - JOB_ROLE_ORDER[JOB_ROLE[b.job]] ||
    a.signedUpAt.toMillis() - b.signedUpAt.toMillis()
  );
}

function participantLine(
  { job, discordId, character, world }: ParticipantDocument,
  jobEmojis: Partial<Record<Job, string>>,
): string {
  return `${jobBadge(job, jobEmojis)} ${userMention(discordId)} ${titleCase(character)}@${titleCase(world)}`;
}

/** Splits at line boundaries so no field's value exceeds Discord's limit. */
function splitField(name: string, lines: readonly string[]): Field[] {
  const chunks: string[][] = [];
  let chunk: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (chunk.length && size + 1 + line.length > MAX_FIELD_VALUE) {
      chunks.push(chunk);
      chunk = [];
    }
    size = chunk.length ? size + 1 + line.length : line.length;
    chunk.push(line);
  }
  chunks.push(chunk);
  return chunks.map((lines, index) => ({
    name: index === 0 ? name : `${name} (cont.)`,
    value: lines.join('\n'),
    count: lines.length,
  }));
}

/** Fills embeds in order; past the last one, its last field counts what's left out. */
function packEmbeds(
  header: EmbedHeader,
  fields: readonly Field[],
): EmbedBuilder[] {
  let page: Field[] = [];
  const pages = [page];
  let size = header.title.length + header.description.length;
  for (const [index, field] of fields.entries()) {
    if (
      page.length === MAX_FIELDS ||
      size + fieldSize(field) > MAX_EMBED_SIZE
    ) {
      if (pages.length === MAX_EMBEDS) {
        page.push(moreField([...page.splice(-1), ...fields.slice(index)]));
        break;
      }
      page = [];
      pages.push(page);
      size = 0;
    }
    page.push(field);
    size += fieldSize(field);
  }
  return pages.map((fields, index) =>
    toEmbed(fields, index === 0 ? header : undefined),
  );
}

function fieldSize({ name, value }: Field): number {
  return name.length + value.length;
}

function moreField(hidden: readonly Field[]): Field {
  const count = hidden.reduce((total, field) => total + field.count, 0);
  return {
    name: '​',
    value: `…and ${count} more. See the board.`,
    count: 0,
  };
}

function toEmbed(fields: readonly Field[], header?: EmbedHeader): EmbedBuilder {
  const embed = new EmbedBuilder().addFields(
    fields.map(({ name, value }) => ({ name, value })),
  );
  return header
    ? embed.setTitle(header.title).setDescription(header.description)
    : embed;
}
