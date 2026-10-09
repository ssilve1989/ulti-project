import { Test } from '@nestjs/testing';
import { type BoardParticipant, Encounter, Job } from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect } from 'vitest';
import { DISCORD_CLIENT } from '../../discord/discord.decorators.js';
import { DiscordService } from '../../discord/discord.service.js';
import { EncountersCollection } from '../../firebase/collections/encounters-collection.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { RostersCollection } from '../../firebase/collections/rosters.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { FIRESTORE } from '../../firebase/firebase.consts.js';
import {
  type EventDocument,
  EventStatus,
  type ParticipantDocument,
} from '../../firebase/models/event.model.js';
import { DiscordMock } from '../../test-utils/discord/discord-mock.js';
import { InMemoryFirestore } from '../../test-utils/firestore/in-memory-firestore.js';
import { fresh } from '../../test-utils/fixtures.js';
import { BoardEventReader } from './board-event.reader.js';

const GUILD = 'guild-1';
const EVENT_ID = 'event-1';
const BOB_ID = 'bob';

const EVENT: EventDocument = Object.freeze({
  guildId: GUILD,
  title: 'DSR prog night',
  startsAt: Timestamp.fromDate(new Date('2026-10-10T20:00:00Z')),
  signupsCloseAt: Timestamp.fromDate(new Date('2026-10-10T18:00:00Z')),
  signupsCloseDueAt: Timestamp.fromDate(new Date('2026-10-10T18:00:00Z')),
  encounters: [Encounter.DSR],
  channelId: 'channel-1',
  createdBy: 'organizer-1',
  status: EventStatus.Open,
});

const aParticipant = (discordId: string): ParticipantDocument => ({
  discordId,
  encounter: Encounter.DSR,
  job: Job.WHM,
  character: `${discordId} character`,
  world: 'jenova',
  phase: { roleId: 'role-p6', label: 'P6', order: 6, bucket: 'prog' },
  signedUpAt: Timestamp.fromDate(new Date('2026-10-08T12:00:00Z')),
});

interface Fixtures {
  db: InMemoryFirestore;
  discord: DiscordMock;
  reader: BoardEventReader;
}

const it = base.extend<Fixtures>({
  db: fresh(() => {
    const db = new InMemoryFirestore();
    db.seed(`events/${EVENT_ID}`, EVENT);
    return db;
  }),
  discord: fresh(() => {
    const discord = new DiscordMock();
    discord.addChannel(GUILD, 'channel-1');
    discord.addMember({ id: BOB_ID, username: 'bob', displayName: 'Bobby' });
    return discord;
  }),
  reader: async ({ db, discord }, use) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BoardEventReader,
        EventsCollection,
        EncountersCollection,
        SettingsCollection,
        RostersCollection,
        DiscordService,
        { provide: FIRESTORE, useValue: db },
        { provide: DISCORD_CLIENT, useValue: discord.client },
      ],
    }).compile();
    await use(moduleRef.get(BoardEventReader));
  },
});

function seedParticipant(db: InMemoryFirestore, discordId: string): void {
  db.seed(
    `events/${EVENT_ID}/participants/${discordId}-${Encounter.DSR}`,
    aParticipant(discordId),
  );
}

/** How the board shows `aParticipant(discordId)`, named `displayName`. */
const shownAs = (discordId: string, displayName: string): BoardParticipant => ({
  id: `${discordId}-DSR`,
  encounter: Encounter.DSR,
  discordId,
  displayName,
  character: `${discordId} character`,
  world: 'jenova',
  job: Job.WHM,
  jobRole: 'healer',
  phase: { label: 'P6', order: 6, bucket: 'prog' },
  claim: null,
});

describe('BoardEventReader.participant', () => {
  it.beforeEach(({ db }) => {
    seedParticipant(db, BOB_ID);
    seedParticipant(db, 'carol');
  });

  it('reads one participant of the event, by guild name', async ({
    reader,
  }) => {
    await expect(
      reader.participant(GUILD, EVENT_ID, `${BOB_ID}-DSR`),
    ).resolves.toEqual(shownAs(BOB_ID, 'Bobby'));
  });

  it('is undefined for someone not signed up', async ({ reader }) => {
    await expect(
      reader.participant(GUILD, EVENT_ID, 'dave-DSR'),
    ).resolves.toBeUndefined();
  });

  it("is undefined for another guild's event", async ({ reader }) => {
    await expect(
      reader.participant('guild-2', EVENT_ID, `${BOB_ID}-DSR`),
    ).resolves.toBeUndefined();
  });
});

describe('BoardEventReader.get, for more players than Discord returns in one fetch', () => {
  const ids = Array.from(
    { length: 150 },
    (_, i) => `player-${String(i).padStart(3, '0')}`,
  );

  it.beforeEach(({ db, discord }) => {
    for (const id of ids) {
      discord.addMember({ id, username: id, displayName: `Guild ${id}` });
      seedParticipant(db, id);
    }
  });

  it('names every one of them by guild name', async ({ reader }) => {
    const event = await reader.get(GUILD, EVENT_ID);

    expect(event?.participants).toEqual(
      ids.map((id) => shownAs(id, `Guild ${id}`)),
    );
  });
});
