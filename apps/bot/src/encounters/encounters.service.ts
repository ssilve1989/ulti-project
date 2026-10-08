import { Injectable } from '@nestjs/common';
import type {
  EncounterDocument,
  ProgPointDocument,
  ProgPointOption,
} from '@ulti-project/shared';
import { PartyStatus } from '@ulti-project/shared';
import { EncountersCollection } from '#src/firebase/collections/encounters-collection.js';

@Injectable()
export class EncountersService {
  constructor(private readonly encountersCollection: EncountersCollection) {}

  public getProgPoints(encounterId: string): Promise<ProgPointDocument[]> {
    return this.encountersCollection.getProgPoints(encounterId);
  }

  public getAllProgPoints(encounterId: string): Promise<ProgPointDocument[]> {
    return this.encountersCollection.getAllProgPoints(encounterId);
  }

  public async getProgPointsAsOptions(
    encounterId: string,
  ): Promise<Record<string, ProgPointOption>> {
    const progPoints = await this.getProgPoints(encounterId);

    return progPoints.reduce<Record<string, ProgPointOption>>(
      (acc, progPoint) => {
        acc[progPoint.id] = {
          label: progPoint.label,
          partyStatus: progPoint.partyStatus,
        };
        return acc;
      },
      {},
    );
  }

  public getEncounter(
    encounterId: string,
  ): Promise<EncounterDocument | undefined> {
    return this.encountersCollection.getEncounter(encounterId);
  }

  public async getPartyStatusForProgPoint(
    encounterId: string,
    progPointId: string,
  ): Promise<PartyStatus> {
    const progPoints = await this.getProgPoints(encounterId);

    const progPoint = progPoints.find((p) => p.id === progPointId);
    if (!progPoint) {
      throw new Error(
        `Prog point not found: ${progPointId} for encounter: ${encounterId}`,
      );
    }

    if (!progPoint.partyStatus) {
      throw new Error(
        `Party status not defined for prog point: ${progPointId} in encounter: ${encounterId}`,
      );
    }

    // Always use the prog point's direct party status when available
    // This represents the intended party type for the specific progression milestone
    return progPoint.partyStatus;
  }
}
