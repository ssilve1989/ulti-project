import * as clack from '@clack/prompts';
import {
  type EventDocument,
  type ParticipantDocument,
  participantDocId,
  type RosterDocument,
  type SettingsDocument,
  type SlotFill,
  typedCollection,
} from '@ulti-project/shared';
import { type Command, InvalidArgumentError } from 'commander';
import { type Firestore, Timestamp } from 'firebase-admin/firestore';
import { ctx } from '../../config.ts';
import { getAllProgPoints } from '../../utils/firestore.ts';
import {
  eventPhases,
  isSeeded,
  type SeedEncounter,
  seededDiscordId,
  seedPlayers,
  seedRefusal,
} from './seed-data.ts';

interface Claim {
  tag: string;
  count: number;
}

// a Firestore batch holds 500 writes; unseed also rewrites rosters in its batch
const MAX_COUNT = 400;

function parseCount(value: string): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new InvalidArgumentError(
      `Must be a whole number from 1 to ${MAX_COUNT}.`,
    );
  }
  return count;
}

function parseClaim(value: string): Claim {
  const [tag, n] = value.split(':');
  const count = Number(n);
  if (!tag || !Number.isInteger(count) || count < 0) {
    throw new InvalidArgumentError('Use <squadTag>:<n>, like FRG:4.');
  }
  return { tag: tag.toUpperCase(), count };
}

function assertSeedAllowed(): void {
  const refusal = seedRefusal(process.env);
  if (refusal) throw new Error(refusal);
}

function participantsOf(db: Firestore, eventId: string) {
  return typedCollection<ParticipantDocument>(
    db,
    `events/${eventId}/participants`,
  );
}

async function runSeed(
  db: Firestore,
  eventId: string,
  { count, claim }: { count: number; claim?: Claim },
): Promise<void> {
  clack.intro(`Seed event ${eventId}`);
  const event = (
    await typedCollection<EventDocument>(db, 'events').doc(eventId).get()
  ).data();
  if (!event) throw new Error(`Event ${eventId} doesn't exist.`);
  const settings = (
    await typedCollection<SettingsDocument>(db, 'settings')
      .doc(event.guildId)
      .get()
  ).data();

  const squadId =
    claim &&
    Object.entries(settings?.squads ?? {}).find(
      ([, squad]) => squad.tag === claim.tag,
    )?.[0];
  if (claim && !squadId) {
    throw new Error(`The guild has no squad tagged ${claim.tag}.`);
  }

  const encounters: SeedEncounter[] = [];
  for (const encounter of event.encounters) {
    const progPoints = await getAllProgPoints(db, encounter);
    if (progPoints.length === 0) {
      throw new Error(`${encounter} has no prog points in Firestore.`);
    }
    const phases = eventPhases(encounter, progPoints, settings);
    if (phases.length === 0) {
      throw new Error(
        `${encounter} has no prog-point or clear roles in the guild settings, so no sign-up could get a phase.`,
      );
    }
    encounters.push({ encounter, phases });
  }

  const players = seedPlayers(count, encounters, new Date());
  const participants = participantsOf(db, eventId);
  const claimedAt = Timestamp.now();
  const batch = db.batch();
  players.forEach(({ signedUpAt, ...player }, i) => {
    const doc: ParticipantDocument = {
      ...player,
      signedUpAt: Timestamp.fromDate(signedUpAt),
      ...(squadId && claim && i < claim.count
        ? { claim: { squadId, claimedBy: seededDiscordId(0), claimedAt } }
        : {}),
    };
    batch.set(
      participants.doc(participantDocId(player.discordId, player.encounter)),
      doc,
    );
  });
  await batch.commit();

  for (const { encounter } of encounters) {
    const mine = players.filter((p) => p.encounter === encounter);
    const prog = mine.filter((p) => p.phase.bucket === 'prog').length;
    clack.log.info(`${encounter}: ${prog} prog, ${mine.length - prog} clear`);
  }
  const claimed = claim ? Math.min(claim.count, count) : 0;
  clack.outro(
    `Seeded ${count} participant(s)${claimed ? `, ${claimed} claimed by ${claim?.tag}` : ''}.`,
  );
}

async function runUnseed(db: Firestore, eventId: string): Promise<void> {
  clack.intro(`Unseed event ${eventId}`);
  const batch = db.batch();

  const participants = await participantsOf(db, eventId).get();
  const seeded = participants.docs.filter((doc) =>
    isSeeded(doc.data().discordId),
  );
  for (const doc of seeded) batch.delete(doc.ref);

  const rosters = await typedCollection<RosterDocument>(
    db,
    `events/${eventId}/rosters`,
  ).get();
  let rostersChanged = 0;
  const seededFill = (fill: SlotFill | undefined) =>
    fill !== undefined && isSeeded(fill.discordId);
  for (const doc of rosters.docs) {
    const roster = doc.data();
    if (
      !roster.teams.some((team) => Object.values(team.slots).some(seededFill))
    ) {
      continue;
    }
    const teams = roster.teams.map((team) => ({
      ...team,
      slots: Object.fromEntries(
        Object.entries(team.slots).filter(([, fill]) => !seededFill(fill)),
      ),
    }));
    batch.set(doc.ref, { ...roster, teams });
    rostersChanged++;
  }

  await batch.commit();
  clack.outro(
    `Removed ${seeded.length} seeded participant(s) and cleared their slots in ${rostersChanged} roster(s).`,
  );
}

export function registerEventsCommand(program: Command): void {
  const eventsCmd = program
    .command('events')
    .description('Seed events with fake sign-ups for manual testing');

  eventsCmd
    .command('seed')
    .description(
      'Add fake participants to an event (development database only)',
    )
    .argument('<eventId>', 'the event document id')
    .option('--count <n>', 'how many participants', parseCount, 32)
    .option(
      '--claim <squadTag:n>',
      'claim the first n seeded participants for the squad',
      parseClaim,
    )
    .action(
      async (eventId: string, options: { count: number; claim?: Claim }) => {
        assertSeedAllowed();
        await runSeed(ctx.db, eventId, options);
      },
    );

  eventsCmd
    .command('unseed')
    .description('Remove the seeded participants from an event and its rosters')
    .argument('<eventId>', 'the event document id')
    .action(async (eventId: string) => {
      assertSeedAllowed();
      await runUnseed(ctx.db, eventId);
    });
}
