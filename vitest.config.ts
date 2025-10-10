import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    chaiConfig: {
      truncateThreshold: 80,
    },
    coverage: {
      include: ['src/**/*.ts'],
      exclude: [
        'src/slash-commands/**/*{-command.ts,.command.ts}',
        '**/*.module.ts',
      ],
      provider: 'v8',
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    setupFiles: ['test/setup.ts'],
  },
  plugins: [
    // This is required to build the test files with SWC
    // We have to use SWC because esbuild does not support `emitDecoratorMetadata` which is required by NestJS
    swc.vite({
      // Explicitly set the module type to avoid inheriting this value from a `.swcrc` config file
      module: { type: 'nodenext' },
    }),
  ],
});
