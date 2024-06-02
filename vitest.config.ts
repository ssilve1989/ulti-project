import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/test-setup.ts'],
    globals: true,
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/slash-commands/**/*-command.ts'],
      provider: 'v8',
    },
    chaiConfig: {
      truncateThreshold: 80,
    },
  },
  plugins: [
    // This is required to build the test files with SWC
    swc.vite({
      // Explicitly set the module type to avoid inheriting this value from a `.swcrc` config file
      module: { type: 'nodenext' },
    }),
  ],
});
