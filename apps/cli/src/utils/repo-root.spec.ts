import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './repo-root.ts';

describe('REPO_ROOT', () => {
  it('is an absolute path', () => {
    expect(isAbsolute(REPO_ROOT)).toBe(true);
  });

  it('is the directory containing pnpm-workspace.yaml', () => {
    expect(existsSync(join(REPO_ROOT, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('anchors the encounter library at the monorepo root', () => {
    expect(join(REPO_ROOT, 'data', 'encounters')).toMatch(
      /\/data\/encounters$/,
    );
  });
});
