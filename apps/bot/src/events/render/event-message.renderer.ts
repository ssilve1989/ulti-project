import {
  type Encounter,
  JOB_ROLE,
  JOB_ROLE_ORDER,
  type Job,
} from '@ulti-project/shared';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
import { eventComponentId } from '../components/event-component-id.js';

// Discord's embed limits
const MAX_FIELD_VALUE = 1024;
const MAX_FIELDS = 25;
const MAX_MESSAGE_SIZE = 6000;
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
  now,
}: EventMessageInput): EventMessage {
  const fields = event.encounters.flatMap((encounter) =>
    encounterFields(
      encounterNames[encounter],
      participants.filter((participant) => participant.encounter === encounter),
      jobEmojis,
    ),
  );
  const header = { title: event.title, description: describe(event) };
  return {
    embeds: packEmbeds(header, fields),
    components: [buttonRow(event, now)],
  };
}

/** Sign up takes sign-ups only while they're open; Withdraw works until the event is closed. */
function buttonRow(
  event: StoredEvent,
  now: Date,
): ActionRowBuilder<ButtonBuilder> {
  const signupsOpen =
    event.status === EventStatus.Open && now < event.signupsCloseAt.toDate();
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(eventComponentId('signup', event.id))
      .setLabel('Sign up')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!signupsOpen),
    new ButtonBuilder()
      .setCustomId(eventComponentId('withdraw', event.id))
      .setLabel('Withdraw')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(event.status === EventStatus.Closed),
  );
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
    `${time(startsAt, TimestampStyles.FullDateShortTime)} (${time(startsAt, TimestampStyles.RelativeTime)})`,
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
        phase.label,
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
function splitField(label: string, lines: readonly string[]): Field[] {
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
  return chunks.map((part, index) => ({
    name: index === 0 ? `${label} (${lines.length})` : `${label} (cont.)`,
    value: part.join('\n'),
    count: part.length,
  }));
}

/**
 * Pages the fields that fit the message into embeds of 25. Discord's 6000
 * characters are for the whole message, so the header counts once.
 */
function packEmbeds(
  header: EmbedHeader,
  fields: readonly Field[],
): EmbedBuilder[] {
  const shown = fitMessage(
    header.title.length + header.description.length,
    fields,
  );
  return Array.from(
    { length: Math.ceil(shown.length / MAX_FIELDS) },
    (_, page) =>
      toEmbed(
        shown.slice(page * MAX_FIELDS, (page + 1) * MAX_FIELDS),
        page === 0 ? header : undefined,
      ),
  );
}

/** The fields that fit; if some don't, the last that did gives way to a count of the rest. */
function fitMessage(headerSize: number, fields: readonly Field[]): Field[] {
  let size = headerSize;
  let fitting = 0;
  for (const field of fields) {
    if (
      fitting === MAX_FIELDS * MAX_EMBEDS ||
      size + fieldSize(field) > MAX_MESSAGE_SIZE
    ) {
      break;
    }
    size += fieldSize(field);
    fitting++;
  }
  if (fitting === fields.length) {
    return [...fields];
  }
  let kept = fields.slice(0, fitting - 1);
  let dropped = fields.slice(fitting - 1);
  while (
    kept.length > 0 &&
    headerSize + totalSize(kept) + fieldSize(moreField(dropped)) >
      MAX_MESSAGE_SIZE
  ) {
    dropped = [...kept.slice(-1), ...dropped];
    kept = kept.slice(0, -1);
  }
  return [...kept, moreField(dropped)];
}

function totalSize(fields: readonly Field[]): number {
  return fields.reduce((total, field) => total + fieldSize(field), 0);
}

function fieldSize({ name, value }: Field): number {
  return name.length + value.length;
}

function moreField(hidden: readonly Field[]): Field {
  const count = hidden.reduce((total, field) => total + field.count, 0);
  return {
    name: '\u200b',
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
