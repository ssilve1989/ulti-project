import * as clack from '@clack/prompts';
import type { Command } from 'commander';
import type {
  DocumentReference,
  Firestore,
  QueryDocumentSnapshot,
  WriteBatch,
} from 'firebase-admin/firestore';
import { guildDoc } from '../../../firebase/firebase.paths.js';
import { ctx } from '../../config.js';
import { cancelIfCancel } from '../../utils/clack.js';

// Firestore caps a batch at 500 writes; --delete-source doubles the writes per
// document, so commit well below the limit.
const BATCH_LIMIT = 200;

interface MigrateCommandOptions {
  dryRun?: boolean;
  deleteSource?: boolean;
  yes?: boolean;
}

interface CopyPlan {
  source: QueryDocumentSnapshot[];
  /** Resolves the destination for a given source document. */
  destination: (doc: QueryDocumentSnapshot) => DocumentReference;
}

/**
 * Commits `writes` in chunks so a large collection can't exceed the batch limit.
 */
async function commitInChunks(
  db: Firestore,
  writes: ((batch: WriteBatch) => void)[],
): Promise<void> {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + BATCH_LIMIT)) {
      write(batch);
    }
    await batch.commit();
  }
}

async function applyPlan(
  db: Firestore,
  plan: CopyPlan,
  deleteSource: boolean,
): Promise<number> {
  const writes = plan.source.flatMap((doc) => {
    const target = plan.destination(doc);
    const ops = [(batch: WriteBatch) => batch.set(target, doc.data())];
    if (deleteSource) {
      ops.push((batch: WriteBatch) => batch.delete(doc.ref));
    }
    return ops;
  });

  await commitInChunks(db, writes);
  return plan.source.length;
}

/**
 * Settings used to be a single document at `settings/{guildId}`; it now lives on
 * the guild document itself, so this is a merge rather than a collection copy.
 */
async function migrateSettings(
  db: Firestore,
  guildId: string,
  { dryRun, deleteSource }: MigrateCommandOptions,
): Promise<number> {
  const legacy = db.collection('settings').doc(guildId);
  const snapshot = await legacy.get();

  if (!snapshot.exists) return 0;
  if (dryRun) return 1;

  await guildDoc(db, guildId).set(snapshot.data() ?? {}, { merge: true });
  if (deleteSource) {
    await legacy.delete();
  }

  return 1;
}

async function migrateSignups(
  db: Firestore,
  guildId: string,
  { dryRun, deleteSource }: MigrateCommandOptions,
): Promise<number> {
  const source = await db.collection('signups').get();
  if (dryRun) return source.size;

  const target = guildDoc(db, guildId).collection('signups');
  return applyPlan(
    db,
    {
      source: source.docs,
      destination: (doc) => target.doc(doc.id),
    },
    !!deleteSource,
  );
}

async function migrateBlacklist(
  db: Firestore,
  guildId: string,
  { dryRun, deleteSource }: MigrateCommandOptions,
): Promise<number> {
  const source = await db
    .collection('blacklist')
    .doc(guildId)
    .collection('documents')
    .get();
  if (dryRun) return source.size;

  const target = guildDoc(db, guildId).collection('blacklist');
  return applyPlan(
    db,
    {
      source: source.docs,
      destination: (doc) => target.doc(doc.id),
    },
    !!deleteSource,
  );
}

/**
 * Encounters carry a `prog-points` subcollection, which a document copy does not
 * follow — each one has to be walked explicitly.
 */
async function migrateEncounters(
  db: Firestore,
  guildId: string,
  { dryRun, deleteSource }: MigrateCommandOptions,
): Promise<{ encounters: number; progPoints: number }> {
  const source = await db.collection('encounters').get();
  const target = guildDoc(db, guildId).collection('encounters');

  let progPoints = 0;

  for (const encounter of source.docs) {
    const legacyProgPoints = await encounter.ref
      .collection('prog-points')
      .get();
    progPoints += legacyProgPoints.size;

    if (dryRun) continue;

    const targetEncounter = target.doc(encounter.id);

    await applyPlan(
      db,
      {
        source: [encounter],
        destination: () => targetEncounter,
      },
      !!deleteSource,
    );

    await applyPlan(
      db,
      {
        source: legacyProgPoints.docs,
        destination: (doc) =>
          targetEncounter.collection('prog-points').doc(doc.id),
      },
      !!deleteSource,
    );
  }

  return { encounters: source.size, progPoints };
}

async function runMigrate(
  db: Firestore,
  guildId: string,
  opts: MigrateCommandOptions,
): Promise<void> {
  clack.intro('Migrate to guild-scoped collections');

  clack.log.info(
    `Target: guilds/${guildId}\n` +
      'Root `signups` and `encounters` documents carry no guild marker, so every\n' +
      'one of them will be assigned to this guild.',
  );

  if (!opts.dryRun && !opts.yes) {
    const confirmed = cancelIfCancel(
      await clack.confirm({
        message: opts.deleteSource
          ? `Copy legacy data into guilds/${guildId} AND delete the originals?`
          : `Copy legacy data into guilds/${guildId}?`,
      }),
    );
    if (!confirmed) {
      clack.outro('Aborted — no changes applied.');
      return;
    }
  }

  const spinner = clack.spinner();
  spinner.start(opts.dryRun ? 'Counting legacy documents...' : 'Migrating...');

  try {
    const settings = await migrateSettings(db, guildId, opts);
    const signups = await migrateSignups(db, guildId, opts);
    const blacklist = await migrateBlacklist(db, guildId, opts);
    const { encounters, progPoints } = await migrateEncounters(
      db,
      guildId,
      opts,
    );

    spinner.stop(opts.dryRun ? 'Counted' : 'Migrated');

    const verb = opts.dryRun ? 'Would copy' : 'Copied';
    clack.log.info(
      [
        `${verb}:`,
        `  settings     ${settings} document(s) -> guilds/${guildId}`,
        `  signups      ${signups} document(s)`,
        `  blacklist    ${blacklist} document(s)`,
        `  encounters   ${encounters} document(s)`,
        `  prog-points  ${progPoints} document(s)`,
      ].join('\n'),
    );
  } catch (error) {
    spinner.stop('Failed');
    clack.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (opts.dryRun) {
    clack.outro('Dry-run complete — no changes applied.');
    return;
  }

  clack.outro(
    opts.deleteSource
      ? 'Done — legacy documents removed.'
      : 'Done — legacy documents left in place. Re-run with --delete-source once the bot is verified healthy.',
  );
}

export function registerMigrateCommand(program: Command): void {
  const migrateCmd = program
    .command('migrate')
    .description('One-off data migrations');

  migrateCmd
    .command('guild-scope')
    .description(
      'Copy legacy settings/signups/blacklist/encounters under guilds/<guildId>',
    )
    .option('--dry-run', 'Report what would be copied without writing')
    .option(
      '--delete-source',
      'Delete the legacy documents after copying them (off by default)',
    )
    .option('--yes', 'Skip confirmation prompts')
    .action(async (opts: MigrateCommandOptions) => {
      await runMigrate(ctx.db, ctx.guildId, opts);
    });
}
