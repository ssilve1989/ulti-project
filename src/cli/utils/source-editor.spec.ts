import { describe, expect, it } from 'vitest';
import {
  addToEncounterChoices,
  addToEncounterEmoji,
  addToEncounterEnum,
  addToEncounterFriendlyDescription,
  addToEncounterIds,
  detectCurrentUltimates,
  type EncounterSourceEdits,
  flipEncounterModeToLegacy,
  planSourceEdits,
} from './source-editor.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ENCOUNTER_ENUM_SOURCE = `export enum Encounter {
  TOP = 'TOP',
  FRU = 'FRU',
}`;

const FRIENDLY_DESC_SOURCE = `export const EncounterFriendlyDescription = Object.freeze({
  [Encounter.TOP]: '[TOP] The Omega Protocol',
});`;

const EMOJI_SOURCE = `export const EncounterEmoji: Record<string, string> = Object.freeze({
  [Encounter.TOP]: '123456',
});`;

const CHOICES_SOURCE = `export const ENCOUNTER_CHOICES: Readonly<EncounterChoice>[] = [
  {
    name: '[TOP] The Omega Protocol',
    value: Encounter.TOP,
    mode: 'ultimate',
  },
];`;

const ENCOUNTER_IDS_SOURCE = `export const EncounterIds = new Map<Encounter, number[]>([
  [Encounter.TOP, [1068]],
]);`;

// ─── detectCurrentUltimates ─────────────────────────────────────────────────

describe('detectCurrentUltimates', () => {
  it('returns keys of encounters with mode ultimate', () => {
    const result = detectCurrentUltimates(CHOICES_SOURCE);
    expect(result).toEqual(['TOP']);
  });

  it('returns empty array when no ultimates exist', () => {
    const source = CHOICES_SOURCE.replace("mode: 'ultimate'", "mode: 'legacy'");
    expect(detectCurrentUltimates(source)).toEqual([]);
  });

  it('returns multiple ultimates if present', () => {
    const source = `${CHOICES_SOURCE}
export const MORE: Readonly<EncounterChoice>[] = [
  {
    name: 'FRU',
    value: Encounter.FRU,
    mode: 'ultimate',
  },
];`;
    expect(detectCurrentUltimates(source)).toEqual(['TOP', 'FRU']);
  });
});

// ─── addToEncounterEnum ─────────────────────────────────────────────────────

describe('addToEncounterEnum', () => {
  it('appends a new entry before the closing brace', () => {
    const result = addToEncounterEnum(ENCOUNTER_ENUM_SOURCE, 'DSR', 'DSR');
    expect(result).toContain("  DSR = 'DSR',");
    expect(result.indexOf("DSR = 'DSR'")).toBeGreaterThan(
      result.indexOf("FRU = 'FRU'"),
    );
  });

  it('throws when enum marker is missing', () => {
    expect(() => addToEncounterEnum('const x = 1;', 'A', 'B')).toThrow(
      'Could not find Encounter enum',
    );
  });
});

// ─── addToEncounterFriendlyDescription ──────────────────────────────────────

describe('addToEncounterFriendlyDescription', () => {
  it('appends a new entry', () => {
    const result = addToEncounterFriendlyDescription(
      FRIENDLY_DESC_SOURCE,
      'DSR',
      '[DSR] Dragonsong',
    );
    expect(result).toContain("[Encounter.DSR]: '[DSR] Dragonsong'");
  });

  it('throws when marker is missing', () => {
    expect(() =>
      addToEncounterFriendlyDescription('const x = 1;', 'A', 'B'),
    ).toThrow('Could not find EncounterFriendlyDescription');
  });
});

// ─── addToEncounterEmoji ────────────────────────────────────────────────────

describe('addToEncounterEmoji', () => {
  it('appends a new emoji entry', () => {
    const result = addToEncounterEmoji(EMOJI_SOURCE, 'DSR', '999888');
    expect(result).toContain("[Encounter.DSR]: '999888'");
  });

  it('throws when marker is missing', () => {
    expect(() => addToEncounterEmoji('const x = 1;', 'A', 'B')).toThrow(
      'Could not find EncounterEmoji',
    );
  });
});

// ─── addToEncounterChoices ──────────────────────────────────────────────────

describe('addToEncounterChoices', () => {
  it('appends a new choice object', () => {
    const result = addToEncounterChoices(
      CHOICES_SOURCE,
      '[DSR] Dragonsong',
      'DSR',
      'legacy',
    );
    expect(result).toContain("name: '[DSR] Dragonsong'");
    expect(result).toContain('value: Encounter.DSR');
    expect(result).toContain("mode: 'legacy'");
  });

  it('throws when marker is missing', () => {
    expect(() => addToEncounterChoices('const x = 1;', 'A', 'B', 'C')).toThrow(
      'Could not find ENCOUNTER_CHOICES',
    );
  });
});

// ─── flipEncounterModeToLegacy ──────────────────────────────────────────────

describe('flipEncounterModeToLegacy', () => {
  it('changes mode from ultimate to legacy for the given key', () => {
    const result = flipEncounterModeToLegacy(CHOICES_SOURCE, 'TOP');
    expect(result).toContain("value: Encounter.TOP,\n    mode: 'legacy'");
    expect(result).not.toContain("mode: 'ultimate'");
  });

  it('throws when the target entry is not found', () => {
    expect(() => flipEncounterModeToLegacy(CHOICES_SOURCE, 'MISSING')).toThrow(
      "Could not find ENCOUNTER_CHOICES entry for MISSING with mode: 'ultimate'",
    );
  });
});

// ─── addToEncounterIds ──────────────────────────────────────────────────────

describe('addToEncounterIds', () => {
  it('appends a new Map entry', () => {
    const result = addToEncounterIds(ENCOUNTER_IDS_SOURCE, 'DSR', [1064, 1065]);
    expect(result).toContain('[Encounter.DSR, [1064, 1065]]');
  });

  it('throws when marker is missing', () => {
    expect(() => addToEncounterIds('const x = 1;', 'A', [1])).toThrow(
      'Could not find EncounterIds',
    );
  });
});

// ─── planSourceEdits ────────────────────────────────────────────────────────

describe('planSourceEdits', () => {
  const baseEdits: EncounterSourceEdits = {
    id: 'DSR',
    value: 'DSR',
    name: '[DSR] Dragonsong',
    description: 'Dragonsong Reprise',
    mode: 'ultimate',
  };

  it('always includes enum, friendly description, and choices', () => {
    const changes = planSourceEdits(baseEdits);
    expect(changes).toHaveLength(3);
    expect(changes.map((c) => c.description)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Encounter enum'),
        expect.stringContaining('EncounterFriendlyDescription'),
        expect.stringContaining('ENCOUNTER_CHOICES'),
      ]),
    );
  });

  it('includes emoji change when emoji is provided', () => {
    const changes = planSourceEdits({ ...baseEdits, emoji: '123' });
    expect(changes).toHaveLength(4);
    expect(changes.some((c) => c.description.includes('EncounterEmoji'))).toBe(
      true,
    );
  });

  it('includes ultimate flip when ultimateToFlip is provided', () => {
    const changes = planSourceEdits({ ...baseEdits, ultimateToFlip: 'FRU' });
    expect(changes).toHaveLength(4);
    expect(
      changes.some((c) => c.description.includes("'ultimate' → 'legacy'")),
    ).toBe(true);
  });

  it('includes fflogs IDs when provided', () => {
    const changes = planSourceEdits({ ...baseEdits, fflogsIds: [1064] });
    expect(changes).toHaveLength(4);
    expect(changes.some((c) => c.description.includes('EncounterIds'))).toBe(
      true,
    );
  });

  it('includes all optional changes together', () => {
    const changes = planSourceEdits({
      ...baseEdits,
      emoji: '123',
      fflogsIds: [1064],
      ultimateToFlip: 'FRU',
    });
    expect(changes).toHaveLength(6);
  });
});
