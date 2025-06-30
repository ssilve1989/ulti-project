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

@Injectable()
export class EncountersComponentsService {
  constructor(private readonly encountersService: EncountersService) {}

  async createProgPointSelectMenu(
    encounter: Encounter,
  ): Promise<StringSelectMenuBuilder> {
    const progPoints = await this.encountersService.getProgPoints(encounter);

    const options: SelectMenuComponentOptionData[] = progPoints.map(
      (progPoint) => ({
        label: progPoint.label,
        value: progPoint.id,
      }),
    );

    // Add the cleared option
    options.push(CLEARED_OPTION);

    return new StringSelectMenuBuilder()
      .setCustomId(PROG_POINT_SELECT_ID)
      .addOptions(options);
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
