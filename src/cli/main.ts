import * as clack from '@clack/prompts';
import { Command } from 'commander';
import { registerEncountersCommand } from './commands/encounters/index.js';
import { registerMigrateCommand } from './commands/migrate/index.js';
import { initCtx } from './config.js';

const program = new Command()
  .name('pnpm cli')
  .description('Ulti-Project management CLI')
  .option(
    '--guild <guildId>',
    'Guild to operate on (defaults to $GUILD_ID). All data is scoped to guilds/<guildId>.',
  );

program.hook('preAction', () => {
  initCtx(program.opts().guild);
});

registerEncountersCommand(program);
registerMigrateCommand(program);

await program.parseAsync().catch((error: unknown) => {
  clack.log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
