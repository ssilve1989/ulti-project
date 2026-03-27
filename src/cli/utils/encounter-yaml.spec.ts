import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartyStatus } from '../../firebase/models/signup.model.js';
import {
  type EncounterYamlConfig,
  readEncounterYaml,
  writeEncounterYaml,
} from './encounter-yaml.js';

// Bun.YAML is only available in the Bun runtime; provide a minimal stub for
// vitest (which runs under Node). JSON round-tripping is sufficient because
// the tests care about schema validation, not YAML formatting.
vi.stubGlobal('Bun', {
  YAML: {
    parse: (raw: string) => {
      // Strip comment lines and blank lines that precede the JSON body
      const stripped = raw
        .split('\n')
        .filter((line) => !line.startsWith('#') && line.trim() !== '')
        .join('\n');
      return JSON.parse(stripped);
    },
    stringify: (obj: unknown) => JSON.stringify(obj, null, 2),
  },
});

const TMP_DIR = join(tmpdir(), 'cli-encounter-yaml-test');

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

const sampleConfig: EncounterYamlConfig = {
  id: 'TOP',
  name: '[TOP] The Omega Protocol',
  description: '[TOP] The Omega Protocol',
  active: true,
  progPoints: [
    {
      id: 'P2 Party Synergy',
      label: 'Phase 2: Party Synergy',
      partyStatus: PartyStatus.EarlyProgParty,
      active: true,
    },
  ],
  progPartyThreshold: 'P2 Party Synergy',
};

describe('writeEncounterYaml', () => {
  it('writes a file with schema header', () => {
    writeEncounterYaml(TMP_DIR, sampleConfig);
    const content = readFileSync(join(TMP_DIR, 'TOP.yaml'), 'utf-8');
    expect(content).toMatch(
      /^# yaml-language-server: \$schema=\.\/encounter\.schema\.yaml/,
    );
    expect(content).toContain('"id": "TOP"');
    expect(content).toContain('"active": true');
  });

  it('creates the directory if it does not exist', () => {
    const nested = join(TMP_DIR, 'nested', 'dir');
    writeEncounterYaml(nested, sampleConfig);
    const content = readFileSync(join(nested, 'TOP.yaml'), 'utf-8');
    expect(content).toContain('"id": "TOP"');
  });
});

describe('readEncounterYaml', () => {
  it('reads and validates a written file (roundtrip)', () => {
    writeEncounterYaml(TMP_DIR, sampleConfig);
    const result = readEncounterYaml(join(TMP_DIR, 'TOP.yaml'));
    expect(result.id).toBe('TOP');
    expect(result.name).toBe('[TOP] The Omega Protocol');
    expect(result.active).toBe(true);
    expect(result.progPoints).toHaveLength(1);
    expect(result.progPoints![0].partyStatus).toBe(PartyStatus.EarlyProgParty);
    expect(result.progPartyThreshold).toBe('P2 Party Synergy');
  });

  it('throws on invalid content', () => {
    const filePath = join(TMP_DIR, 'bad.yaml');
    writeFileSync(filePath, JSON.stringify({ id: 123, active: 'notbool' }));
    expect(() => readEncounterYaml(filePath)).toThrow('Invalid encounter YAML');
  });
});
