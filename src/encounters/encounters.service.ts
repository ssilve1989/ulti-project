import { Injectable, Logger } from '@nestjs/common';
import { EncountersCollection } from '../firebase/collections/encounters-collection.js';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '../firebase/models/encounter.model.js';
import { PartyStatus } from '../firebase/models/signup.model.js';
import type { ProgPointOption } from './encounters.consts.js';

@Injectable()
export class EncountersService {
  private readonly logger = new Logger(EncountersService.name);

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

    return progPoints.reduce(
      (acc, progPoint) => {
        acc[progPoint.id] = {
          label: progPoint.label,
          partyStatus: progPoint.partyStatus,
        };
        return acc;
      },
      {} as Record<string, ProgPointOption>,
    );
  }

  public getEncounter(
    encounterId: string,
  ): Promise<EncounterDocument | undefined> {
    return this.encountersCollection.getEncounter(encounterId);
  }

  public async addProgPoint(
    encounterId: string,
    progPointData: {
      id: string;
      label: string;
      partyStatus: PartyStatus;
    },
  ): Promise<void> {
    const nextOrder =
      await this.encountersCollection.getNextProgPointOrder(encounterId);

    const progPoint: ProgPointDocument = {
      ...progPointData,
      order: nextOrder,
      active: true,
    };

    await this.encountersCollection.addProgPoint(encounterId, progPoint);
    this.logger.log(
      `Added prog point ${progPointData.id} to encounter ${encounterId}`,
    );
  }

  public async updateProgPoint(
    encounterId: string,
    progPointId: string,
    updates: Partial<Pick<ProgPointDocument, 'label' | 'partyStatus'>>,
  ): Promise<void> {
    await this.encountersCollection.updateProgPoint(
      encounterId,
      progPointId,
      updates,
    );
    this.logger.log(
      `Updated prog point ${progPointId} in encounter ${encounterId}`,
    );
  }

  public async deactivateProgPoint(
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    await this.encountersCollection.deactivateProgPoint(
      encounterId,
      progPointId,
    );
    this.logger.log(
      `Deactivated prog point ${progPointId} from encounter ${encounterId}`,
    );
  }

  public async deleteProgPoint(
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    // Enhanced validation for deletion - check threshold dependencies
    const encounter = await this.encountersCollection.getEncounter(encounterId);
    const allProgPoints = await this.getAllProgPoints(encounterId);
    const progPoint = allProgPoints.find((p) => p.id === progPointId);

    if (!progPoint) {
      throw new Error(`Prog point ${progPointId} not found`);
    }

    // Check if prog point is used as a threshold - prevent deletion
    if (encounter) {
      if (
        encounter.progPartyThreshold === progPointId ||
        encounter.clearPartyThreshold === progPointId
      ) {
        throw new Error(
          `Cannot delete prog point ${progPointId} as it is currently used as a threshold. Please update the thresholds first.`,
        );
      }
    }

    await this.encountersCollection.deleteProgPoint(encounterId, progPointId);
    this.logger.log(
      `Permanently deleted prog point ${progPointId} from encounter ${encounterId}`,
    );
  }

  public async toggleProgPointActive(
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    // Check if prog point is used as a threshold before deactivating
    const encounter = await this.encountersCollection.getEncounter(encounterId);
    const allProgPoints = await this.getAllProgPoints(encounterId);
    const progPoint = allProgPoints.find((p) => p.id === progPointId);

    if (!progPoint) {
      throw new Error(`Prog point ${progPointId} not found`);
    }

    // If we're trying to deactivate an active prog point, check threshold dependencies
    if (progPoint.active && encounter) {
      if (
        encounter.progPartyThreshold === progPointId ||
        encounter.clearPartyThreshold === progPointId
      ) {
        throw new Error(
          `Cannot deactivate prog point ${progPointId} as it is currently used as a threshold. Please update the thresholds first.`,
        );
      }
    }

    await this.encountersCollection.toggleProgPointActive(
      encounterId,
      progPointId,
    );

    const action = progPoint.active ? 'deactivated' : 'activated';
    this.logger.log(
      `${action} prog point ${progPointId} in encounter ${encounterId}`,
    );
  }

  public async reorderProgPoints(
    encounterId: string,
    progPointIds: string[],
  ): Promise<void> {
    const progPointsWithNewOrder = progPointIds.map((id, index) => ({
      id,
      order: index,
    }));

    await this.encountersCollection.reorderProgPoints(
      encounterId,
      progPointsWithNewOrder,
    );
    this.logger.log(`Reordered prog points for encounter ${encounterId}`);
  }

  public async setProgPartyThreshold(
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    await this.encountersCollection.upsertEncounter(encounterId, {
      progPartyThreshold: progPointId,
    });
    this.logger.log(
      `Set prog party threshold to ${progPointId} for encounter ${encounterId}`,
    );
  }

  public async setClearPartyThreshold(
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    await this.encountersCollection.upsertEncounter(encounterId, {
      clearPartyThreshold: progPointId,
    });
    this.logger.log(
      `Set clear party threshold to ${progPointId} for encounter ${encounterId}`,
    );
  }

  public async getProgPartyThreshold(
    encounterId: string,
  ): Promise<string | undefined> {
    const encounter = await this.getEncounter(encounterId);
    return encounter?.progPartyThreshold;
  }

  public async getClearPartyThreshold(
    encounterId: string,
  ): Promise<string | undefined> {
    const encounter = await this.getEncounter(encounterId);
    return encounter?.clearPartyThreshold;
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

  public async initializeEncounter(
    encounterId: string,
    encounterData: {
      name: string;
      description: string;
      progPoints: Array<{
        id: string;
        label: string;
        partyStatus: PartyStatus;
      }>;
      progPartyThreshold?: string;
      clearPartyThreshold?: string;
    },
  ): Promise<void> {
    // Create or update the encounter document
    await this.encountersCollection.upsertEncounter(encounterId, {
      name: encounterData.name,
      description: encounterData.description,
      active: true,
      progPartyThreshold: encounterData.progPartyThreshold,
      clearPartyThreshold: encounterData.clearPartyThreshold,
    });

    // Add all prog points
    for (let i = 0; i < encounterData.progPoints.length; i++) {
      const progPointData = encounterData.progPoints[i];
      const progPoint: ProgPointDocument = {
        ...progPointData,
        order: i,
        active: true,
      };

      await this.encountersCollection.addProgPoint(encounterId, progPoint);
    }

    this.logger.log(
      `Initialized encounter ${encounterId} with ${encounterData.progPoints.length} prog points`,
    );
  }
}
