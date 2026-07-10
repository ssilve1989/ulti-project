import { ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import {
  buildProgPointRolesEmbed,
  buildTruncatedList,
  createEncounterSelectRow,
  createNavRow,
  getConfiguredProgPointEncounters,
  SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID,
} from './view-settings.components.js';

describe('view-settings components', () => {
  describe('createNavRow', () => {
    it('disables and highlights the active section button', () => {
      const row = createNavRow('encounterRoles').toJSON();

      const [overview, encounterRoles, progPointRoles] = row.components as {
        custom_id: string;
        style: ButtonStyle;
        disabled?: boolean;
      }[];

      expect(encounterRoles.custom_id).toBe(
        SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID,
      );
      expect(encounterRoles.style).toBe(ButtonStyle.Primary);
      expect(encounterRoles.disabled).toBe(true);

      for (const button of [overview, progPointRoles]) {
        expect(button.style).toBe(ButtonStyle.Secondary);
        expect(button.disabled).toBe(false);
      }
    });
  });

  describe('getConfiguredProgPointEncounters', () => {
    it('returns only encounters with a non-empty mapping', () => {
      expect(
        getConfiguredProgPointEncounters({
          TOP: { P1: 'r1' },
          DSR: {},
          UWU: undefined,
        }),
      ).toEqual([Encounter.TOP]);
    });

    it('returns an empty array for undefined settings', () => {
      expect(getConfiguredProgPointEncounters(undefined)).toEqual([]);
    });
  });

  describe('createEncounterSelectRow', () => {
    it('marks the selected encounter as the default option', () => {
      const row = createEncounterSelectRow(
        [Encounter.TOP, Encounter.DSR],
        Encounter.DSR,
      ).toJSON();

      const [menu] = row.components as {
        options: { value: string; default?: boolean }[];
      }[];

      expect(menu.options).toEqual([
        expect.objectContaining({ value: Encounter.TOP, default: false }),
        expect.objectContaining({ value: Encounter.DSR, default: true }),
      ]);
    });
  });

  describe('buildTruncatedList', () => {
    it('joins lines untouched when under the limit', () => {
      expect(buildTruncatedList(['a', 'b'], 1024)).toBe('a\nb');
    });

    it('truncates an oversized list to fit the limit', () => {
      const lines = Array.from(
        { length: 30 },
        (_, i) =>
          `**ProgPointWithALongIdentifier${i}:** <@&role-id-that-is-quite-long-${i}>`,
      );

      const value = buildTruncatedList(lines, 1024);

      expect(value.length).toBeLessThanOrEqual(1024);
      expect(value).toMatch(/… and \d+ more$/);
    });
  });

  describe('buildProgPointRolesEmbed', () => {
    it('states when nothing is configured', () => {
      const embed = buildProgPointRolesEmbed({ progPointRoles: {} });

      expect(embed.data.description).toBe('No prog point roles configured.');
    });

    it('prompts for a selection when no encounter is chosen', () => {
      const embed = buildProgPointRolesEmbed({
        progPointRoles: { TOP: { P1: 'r1' } },
      });

      expect(embed.data.description).toBe(
        'Select an encounter below to view its prog point role mappings.',
      );
    });

    it('lists the selected encounter mappings in the description', () => {
      const embed = buildProgPointRolesEmbed(
        { progPointRoles: { TOP: { P1: 'r1', P2: 'r2' } } },
        Encounter.TOP,
      );

      expect(embed.data.title).toBe('Settings — Prog Point Roles — TOP');
      expect(embed.data.description).toBe('**P1:** <@&r1>\n**P2:** <@&r2>');
    });
  });
});
