import * as clack from '@clack/prompts';
import { Command } from 'commander';
import { registerEncountersCommand } from './commands/encounters/index.js';
import type { CliContext } from './config.js';
import { createCliContext } from './config.js';

let _ctx!: CliContext;
const getCtx = (): CliContext => _ctx;

const program = new Command()
  .name('pnpm cli')
  .description('Ulti-Project management CLI');

program.hook('preAction', () => {
  _ctx = createCliContext();
});

registerEncountersCommand(program, getCtx);

await program.parseAsync().catch((error: unknown) => {
  clack.log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
