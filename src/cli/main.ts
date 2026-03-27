import * as clack from '@clack/prompts';
import type { AddCommandOptions } from './commands/encounters/add/index.js';
import { runAdd } from './commands/encounters/add/index.js';
import { runManageProgPoints } from './commands/encounters/manage-prog-points/index.js';
import { runViewCommand } from './commands/encounters/view.js';
import { createCliContext } from './config.js';

interface ParsedArgs {
  command: string;
  subcommand: string;
  opts: AddCommandOptions & { encounterId?: string };
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // remove 'node' and script path

  const command = args[0] ?? '';
  const subcommand = args[1] ?? '';

  const opts: AddCommandOptions & { encounterId?: string } = {};

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config' && args[i + 1]) {
      opts.config = args[++i];
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--yes') {
      opts.yes = true;
    } else if (arg === '--fflogs-encounter-id' && args[i + 1]) {
      opts.fflogsEncounterId = args[++i];
    } else if (!arg.startsWith('--')) {
      opts.encounterId = arg;
    }
  }

  return { command, subcommand, opts };
}

function printUsage(): void {
  console.log(`
Usage: pnpm cli <command> <subcommand> [options]

Commands:
  encounters add                   Add a new encounter (interactive or --config)
  encounters manage-prog-points    Manage prog points for an encounter
  encounters view [encounter-id]   View encounter configuration from Firestore

Options for 'encounters add':
  --config <path>                  Load encounter from YAML/JSON file
  --dry-run                        Print planned changes without applying
  --yes                            Skip confirmation prompts
  --fflogs-encounter-id <ids>      Comma-separated FF Logs encounter IDs
`);
}

async function main(): Promise<void> {
  const { command, subcommand, opts } = parseArgs(process.argv);

  if (!command || command === 'help') {
    printUsage();
    process.exit(0);
  }

  if (command !== 'encounters') {
    clack.log.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  if (!subcommand) {
    clack.log.error('Missing subcommand for encounters.');
    printUsage();
    process.exit(1);
  }

  const { db, fflogsToken } = createCliContext();

  if (subcommand === 'add') {
    await runAdd(db, fflogsToken, opts);
  } else if (subcommand === 'manage-prog-points') {
    await runManageProgPoints(db);
  } else if (subcommand === 'view') {
    await runViewCommand(db, opts.encounterId);
  } else {
    clack.log.error(`Unknown encounters subcommand: ${subcommand}`);
    printUsage();
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  clack.log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
