#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Skip in Docker build context (no .git dir) and when devDeps aren't installed
const isGitRepo = existsSync('.git');
if (!isGitRepo) {
  console.log('Skipping CLI build (not in a git repository)');
  process.exit(0);
}

const nccBin = 'node_modules/.bin/ncc';
if (!existsSync(nccBin)) {
  console.log('Skipping CLI build (@vercel/ncc not available)');
  process.exit(0);
}

try {
  console.log('Building CLI...');
  execSync(`${nccBin} build src/cli/main.ts -o dist/cli -q`, {
    stdio: 'inherit',
  });
  console.log('CLI built to dist/cli/index.js');
} catch (error) {
  console.error('CLI build failed:', error.message);
  process.exit(1);
}
