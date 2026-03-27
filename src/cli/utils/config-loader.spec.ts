import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PartyStatus } from '../../firebase/models/signup.model.js';
import { loadEncounterConfig } from './config-loader.js';

const TMP_DIR = join(tmpdir(), 'cli-config-loader-test');

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function writeConfig(filename: string, content: string): string {
  const filePath = join(TMP_DIR, filename);
  writeFileSync(filePath, content);
  return filePath;
}

const validConfig = {
  id: 'DSR',
  name: '[DSR] Dragonsong',
  description: 'Dragonsong Reprise',
  mode: 'ultimate',
  progPoints: [
    { id: 'P1', label: 'Phase 1', partyStatus: PartyStatus.EarlyProgParty },
    { id: 'P2', label: 'Phase 2', partyStatus: PartyStatus.ProgParty },
  ],
  progPartyThreshold: 'P1',
  clearPartyThreshold: 'P2',
};

describe('loadEncounterConfig', () => {
  it('loads and validates a JSON config file', () => {
    const filePath = writeConfig('enc.json', JSON.stringify(validConfig));
    const result = loadEncounterConfig(filePath);
    expect(result.id).toBe('DSR');
    expect(result.progPoints).toHaveLength(2);
  });

  it('throws for unsupported file extensions', () => {
    const filePath = writeConfig('enc.txt', '{}');
    expect(() => loadEncounterConfig(filePath)).toThrow(
      'Unsupported config file format',
    );
  });

  it('throws when required fields are missing', () => {
    const filePath = writeConfig('enc.json', JSON.stringify({ id: 'X' }));
    expect(() => loadEncounterConfig(filePath)).toThrow(
      'Invalid encounter config',
    );
  });

  it('throws when id format is invalid', () => {
    const filePath = writeConfig(
      'enc.json',
      JSON.stringify({ ...validConfig, id: 'lower' }),
    );
    expect(() => loadEncounterConfig(filePath)).toThrow(
      'Invalid encounter config',
    );
  });

  it('throws when progPartyThreshold references non-existent prog point', () => {
    const filePath = writeConfig(
      'enc.json',
      JSON.stringify({ ...validConfig, progPartyThreshold: 'MISSING' }),
    );
    expect(() => loadEncounterConfig(filePath)).toThrow(
      "progPartyThreshold 'MISSING' does not match any prog point id",
    );
  });

  it('throws when clearPartyThreshold references non-existent prog point', () => {
    const filePath = writeConfig(
      'enc.json',
      JSON.stringify({ ...validConfig, clearPartyThreshold: 'MISSING' }),
    );
    expect(() => loadEncounterConfig(filePath)).toThrow(
      "clearPartyThreshold 'MISSING' does not match any prog point id",
    );
  });

  it('allows config without progPoints or thresholds', () => {
    const minimal = {
      id: 'DSR',
      name: '[DSR] Dragonsong',
      description: 'Dragonsong Reprise',
      mode: 'ultimate',
    };
    const filePath = writeConfig('enc.json', JSON.stringify(minimal));
    const result = loadEncounterConfig(filePath);
    expect(result.id).toBe('DSR');
    expect(result.progPoints).toBeUndefined();
  });

  it('allows thresholds when they match prog point ids', () => {
    const filePath = writeConfig('enc.json', JSON.stringify(validConfig));
    const result = loadEncounterConfig(filePath);
    expect(result.progPartyThreshold).toBe('P1');
    expect(result.clearPartyThreshold).toBe('P2');
  });
});
