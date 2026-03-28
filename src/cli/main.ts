import * as clack from '@clack/prompts';
import { Command } from 'commander';
import { registerEncountersCommand } from './commands/encounters/index.js';
import { initCtx } from './config.js';

const program = new Command()
  .name('pnpm cli')
  .description('Ulti-Project management CLI');

program.hook('preAction', () => {
  initCtx();
});

registerEncountersCommand(program);

await program.parseAsync().catch((error: unknown) => {
  clack.log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
