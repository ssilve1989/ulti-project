import { Test } from '@nestjs/testing';
import { Encounter, PartyStatus } from '@ulti-project/shared';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import { createAutoMock } from '../test-utils/mock-factory.js';
import { PROG_POINT_SELECT_ID } from './encounters.components.js';
import { EncountersService } from './encounters.service.js';
import { EncountersComponentsService } from './encounters-components.service.js';

describe('EncountersComponentsService', () => {
  let service: EncountersComponentsService;
  let encountersService: Mocked<EncountersService>;

  const progPoints = [
    {
      id: 'P1',
      label: 'Phase 1',
      partyStatus: PartyStatus.EarlyProgParty,
      order: 0,
      active: true,
    },
    {
      id: 'P2',
      label: 'Phase 2',
      partyStatus: PartyStatus.ProgParty,
      order: 1,
      active: true,
    },
  ];

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EncountersComponentsService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(EncountersComponentsService);
    encountersService = fixture.get(EncountersService);
    encountersService.getProgPoints.mockResolvedValue(progPoints);
  });

  it('builds a single-select menu with the cleared option by default', async () => {
    const menu = await service.createProgPointSelectMenu(Encounter.TOP);

    expect(menu.data.custom_id).toBe(PROG_POINT_SELECT_ID);
    expect(menu.options.map((o) => o.data.value)).toEqual([
      'P1',
      'P2',
      PartyStatus.Cleared,
    ]);
    expect(menu.data.max_values).toBeUndefined();
  });

  it('pre-selects the option matching defaultValue', async () => {
    const menu = await service.createProgPointSelectMenu(Encounter.TOP, {
      defaultValue: 'P2',
    });

    const defaults = menu.options
      .filter((o) => o.data.default)
      .map((o) => o.data.value);
    expect(defaults).toEqual(['P2']);
  });

  it('pre-selects the cleared option when defaultValue is Cleared', async () => {
    const menu = await service.createProgPointSelectMenu(Encounter.TOP, {
      defaultValue: PartyStatus.Cleared,
    });

    const defaults = menu.options
      .filter((o) => o.data.default)
      .map((o) => o.data.value);
    expect(defaults).toEqual([PartyStatus.Cleared]);
  });

  it('marks no option as default when defaultValue is omitted', async () => {
    const menu = await service.createProgPointSelectMenu(Encounter.TOP);

    expect(menu.options.some((o) => o.data.default)).toBe(false);
  });

  it('builds a multi-select menu without cleared when configured', async () => {
    const menu = await service.createProgPointSelectMenu(Encounter.TOP, {
      customId: 'customSelect',
      includeCleared: false,
      multiSelect: true,
    });

    expect(menu.data.custom_id).toBe('customSelect');
    expect(menu.options.map((o) => o.data.value)).toEqual(['P1', 'P2']);
    expect(menu.data.min_values).toBe(1);
    expect(menu.data.max_values).toBe(2);
  });
});
