import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/slash-commands/**/*-command.ts'],
      // istanbul seems more accurate atm than v8 for things like ignoring TS interfaces, etc
      provider: 'istanbul',
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
