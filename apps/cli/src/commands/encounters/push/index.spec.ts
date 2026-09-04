import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getEncounterYamlPaths } from './index.ts';

describe('getEncounterYamlPaths', () => {
  it('excludes the schema reference file, only real encounter definitions', () => {
    const paths = getEncounterYamlPaths();

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.map((p) => basename(p))).not.toContain(
      'encounter.schema.yaml',
    );
  });

  it('still returns every real encounter file', () => {
    const paths = getEncounterYamlPaths().map((p) => basename(p));

    expect(paths).toContain('FRU.yaml');
    expect(paths).toContain('DMU.yaml');
  });

  it('returns a single path when an encounter id is given, unaffected by the directory scan', () => {
    const paths = getEncounterYamlPaths('FRU');

    expect(paths).toHaveLength(1);
    expect(basename(paths[0])).toBe('FRU.yaml');
  });
});
