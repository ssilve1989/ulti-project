import { fileURLToPath } from 'node:url';
import { defaultExclude, defineConfig } from 'vitest/config';

const sharedIndex = fileURLToPath(
  new URL('./packages/shared/src/index.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: {
      '@ulti-project/shared': sharedIndex,
    },
  },
  test: {
    exclude: [...defaultExclude, '.worktrees/**'],
    chaiConfig: {
      truncateThreshold: 80,
    },
    coverage: {
      include: ['apps/bot/src/**/*.ts', 'packages/shared/src/**/*.ts'],
      exclude: [
        'apps/bot/src/slash-commands/**/*{-command.ts,.command.ts}',
        '**/*.module.ts',
        'apps/cli/**',
      ],
      provider: 'v8',
    },
    pool: 'threads',
    setupFiles: ['test/setup.ts'],
  },
});
