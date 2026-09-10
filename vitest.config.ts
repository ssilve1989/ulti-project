import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const sharedIndex = fileURLToPath(
  new URL('./packages/shared/src/index.ts', import.meta.url),
);
const setupFile = fileURLToPath(new URL('./test/setup.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ulti-project/shared': sharedIndex,
    },
  },
  test: {
    chaiConfig: {
      truncateThreshold: 80,
    },
    // Root-only: coverage aggregates across every project below.
    coverage: {
      include: ['apps/bot/src/**/*.ts', 'packages/shared/src/**/*.ts'],
      exclude: [
        'apps/bot/src/slash-commands/**/*{-command.ts,.command.ts}',
        '**/*.module.ts',
        'apps/cli/**',
      ],
      provider: 'v8',
    },
    // The options below are inherited by every project via `extends: true`.
    pool: 'threads',
    // Spec files share one module registry (no per-file re-evaluation). This is
    // ~2.8x faster than isolated runs; the trade-off is that specs must not leak
    // shared state — global mock resets (`vi.resetAllMocks`) and module mocks of
    // already-evaluated modules need care. `pnpm test:shuffle` guards against
    // order-dependence regressions.
    isolate: false,
    setupFiles: [setupFile],
    // One project per package, each rooted at the package directory. Test
    // discovery is anchored to `<package>/src`, so it cannot wander into nested
    // checkouts (git worktrees under `.claude/worktrees/`, stray clones) the way
    // a single repo-wide `**/*.spec.ts` glob does.
    projects: [
      {
        extends: true,
        test: {
          name: 'bot',
          root: './apps/bot',
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'cli',
          root: './apps/cli',
          include: ['src/**/*.spec.ts'],
        },
      },
    ],
  },
});
