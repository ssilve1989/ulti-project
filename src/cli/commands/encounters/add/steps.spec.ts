import { describe, expect, it } from 'vitest';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import type { EncounterConfig } from '../../../utils/config-loader.js';
import { buildSourceEdits } from './steps.js';

const baseConfig: EncounterConfig = {
  id: 'DSR',
  name: '[DSR] Dragonsong Reprise',
  description: 'Dragonsong Reprise (Ultimate)',
  mode: 'ultimate',
};

describe('buildSourceEdits', () => {
  it('maps config fields to source edit fields', () => {
    const result = buildSourceEdits(baseConfig);
    expect(result).toEqual({
      id: 'DSR',
      value: 'DSR',
      name: '[DSR] Dragonsong Reprise',
      description: 'Dragonsong Reprise (Ultimate)',
      mode: 'ultimate',
      emoji: undefined,
      fflogsIds: undefined,
      ultimateToFlip: undefined,
    });
  });

  it('includes emoji when provided', () => {
    const config: EncounterConfig = { ...baseConfig, emoji: '123456' };
    const result = buildSourceEdits(config);
    expect(result.emoji).toBe('123456');
  });

  it('includes fflogsIds when provided', () => {
    const config: EncounterConfig = {
      ...baseConfig,
      fflogsEncounterIds: [1064, 1065],
    };
    const result = buildSourceEdits(config);
    expect(result.fflogsIds).toEqual([1064, 1065]);
  });

  it('includes ultimateToFlip when provided', () => {
    const result = buildSourceEdits(baseConfig, 'FRU');
    expect(result.ultimateToFlip).toBe('FRU');
  });

  it('includes all optional fields together', () => {
    const config: EncounterConfig = {
      ...baseConfig,
      emoji: '789',
      fflogsEncounterIds: [42],
      progPoints: [
        { id: 'P1', label: 'Phase 1', partyStatus: PartyStatus.ProgParty },
      ],
      progPartyThreshold: 'P1',
    };
    const result = buildSourceEdits(config, 'TOP');
    expect(result.emoji).toBe('789');
    expect(result.fflogsIds).toEqual([42]);
    expect(result.ultimateToFlip).toBe('TOP');
  });
});
