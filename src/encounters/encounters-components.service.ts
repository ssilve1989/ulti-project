import { Injectable } from '@nestjs/common';
import {
  type SelectMenuComponentOptionData,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  CLEARED_OPTION,
  PROG_POINT_SELECT_ID,
} from './encounters.components.js';
import type { Encounter } from './encounters.consts.js';
import { EncountersService } from './encounters.service.js';

export interface ProgPointSelectMenuOptions {
  customId?: string;
  includeCleared?: boolean;
  multiSelect?: boolean;
}

@Injectable()
export class EncountersComponentsService {
  constructor(private readonly encountersService: EncountersService) {}

  async createProgPointSelectMenu(
    encounter: Encounter,
    {
      customId = PROG_POINT_SELECT_ID,
      includeCleared = true,
      multiSelect = false,
    }: ProgPointSelectMenuOptions = {},
  ): Promise<StringSelectMenuBuilder> {
    const progPoints = await this.encountersService.getProgPoints(encounter);

    const options: SelectMenuComponentOptionData[] = progPoints.map(
      (progPoint) => ({
        label: progPoint.label,
        value: progPoint.id,
      }),
    );

    if (includeCleared) {
      options.push(CLEARED_OPTION);
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .addOptions(options);

    if (multiSelect) {
      menu.setMinValues(1).setMaxValues(options.length);
    }

    return menu;
  }

  async getProgPointOptions(
    encounter: Encounter,
  ): Promise<SelectMenuComponentOptionData[]> {
    const progPoints = await this.encountersService.getProgPoints(encounter);

    const options: SelectMenuComponentOptionData[] = progPoints.map(
      (progPoint) => ({
        label: progPoint.label,
        value: progPoint.id,
      }),
    );

    // Add the cleared option
    options.push(CLEARED_OPTION);

    return options;
  }
}
