import {
  CLEARED_OPTION,
  EncounterProgMenus,
  progPointOptions,
} from './encounters.components.js';
import type { Encounter } from './encounters.consts.js';

describe('Prog Point Components', () => {
  it.each(Object.entries(EncounterProgMenus))(
    'should create StringSelectMenuBuilders with the right options for %s',
    (encounter, menu) => {
      const options =
        progPointOptions[encounter as Encounter].concat(CLEARED_OPTION);

      expect(
        menu.options.map((v) => ({ label: v.data.label, value: v.data.value })),
      ).toEqual(expect.arrayContaining(options));
    },
  );
});
