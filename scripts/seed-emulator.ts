// Runs as plain `node scripts/seed-emulator.ts` (no ts-node/tsx). Node's
// native TS support strips this file and executes @ulti-project/shared
// straight from its TS source, so no prior build is required.
import {
  createFirestore,
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'FIRESTORE_EMULATOR_HOST is not set - refusing to seed. This script only ever writes to the local emulator.',
  );
  process.exit(1);
}

const db = createFirestore({
  clientEmail: 'emulator',
  privateKey: 'emulator',
  projectId: process.env.GCP_PROJECT_ID ?? 'ulti-project-emulator',
});

function getKey(discordId: string, encounter: Encounter): string {
  return `${discordId.toLowerCase()}-${encounter}`;
}

const expiresAt = Timestamp.fromMillis(Date.now() + 28 * 24 * 60 * 60 * 1000);

const signups: Record<string, SignupDocument> = {
  [getKey('100000000000000001', Encounter.FRU)]: {
    character: 'Alice Prog',
    discordId: '100000000000000001',
    encounter: Encounter.FRU,
    role: 'Tank',
    progPoint: 'P4: Enrage',
    progPointRequested: 'P4: Enrage',
    partyStatus: PartyStatus.ProgParty,
    reviewedBy: '900000000000000001',
    status: SignupStatus.APPROVED,
    username: 'alice',
    world: 'Excalibur',
    expiresAt,
  },
  [getKey('100000000000000002', Encounter.FRU)]: {
    character: 'Beatrix Clear',
    discordId: '100000000000000002',
    encounter: Encounter.FRU,
    role: 'Healer',
    progPoint: 'P5: Fulgent 1',
    progPointRequested: 'P5: Fulgent 1',
    partyStatus: PartyStatus.ClearParty,
    reviewedBy: '900000000000000001',
    status: SignupStatus.APPROVED,
    username: 'beatrix',
    world: 'Excalibur',
    expiresAt,
  },
  [getKey('100000000000000003', Encounter.FRU)]: {
    character: 'Cid Newbie',
    discordId: '100000000000000003',
    encounter: Encounter.FRU,
    role: 'DPS',
    progPointRequested: 'P2: Adds',
    status: SignupStatus.PENDING,
    username: 'cid',
    world: 'Balmung',
    expiresAt,
  },
  [getKey('100000000000000004', Encounter.DSR)]: {
    character: 'Diana Early',
    discordId: '100000000000000004',
    encounter: Encounter.DSR,
    role: 'DPS',
    progPoint: 'Sanctity',
    progPointRequested: 'Sanctity',
    partyStatus: PartyStatus.EarlyProgParty,
    reviewedBy: '900000000000000001',
    status: SignupStatus.APPROVED,
    username: 'diana',
    world: 'Balmung',
    expiresAt,
  },
  [getKey('100000000000000005', Encounter.DSR)]: {
    character: 'Elowen Nid',
    discordId: '100000000000000005',
    encounter: Encounter.DSR,
    role: 'Tank',
    progPoint: 'Nidhogg',
    progPointRequested: 'Nidhogg',
    partyStatus: PartyStatus.ProgParty,
    reviewedBy: '900000000000000001',
    status: SignupStatus.APPROVED,
    username: 'elowen',
    world: 'Gilgamesh',
    expiresAt,
  },
};

async function seed(): Promise<void> {
  const batch = db.batch();
  for (const [key, signup] of Object.entries(signups)) {
    batch.set(db.collection('signups').doc(key), signup);
  }
  await batch.commit();
  console.log(`Seeded ${Object.keys(signups).length} signups.`);
}

await seed();
