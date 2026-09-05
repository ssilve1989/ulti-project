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
    // Spec files share one module registry (no per-file re-evaluation). This is
    // ~2.8x faster than isolated runs; the trade-off is that specs must not leak
    // shared state — global mock resets (`vi.resetAllMocks`) and module mocks of
    // already-evaluated modules need care. `pnpm test:shuffle` guards against
    // order-dependence regressions.
    isolate: false,
    setupFiles: ['test/setup.ts'],
  },
});
