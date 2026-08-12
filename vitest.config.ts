import { defaultExclude, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...defaultExclude, '.worktrees/**'],
    chaiConfig: {
      truncateThreshold: 80,
    },
    coverage: {
      include: ['src/**/*.ts'],
      exclude: [
        'src/slash-commands/**/*{-command.ts,.command.ts}',
        '**/*.module.ts',
        'src/cli/**',
      ],
      provider: 'v8',
    },
    pool: 'threads',
    setupFiles: ['test/setup.ts'],
  },
});
