import { Injectable, Logger } from '@nestjs/common';
import { EncountersCollection } from '../firebase/collections/encounters-collection.js';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '../firebase/models/encounter.model.js';
import { PartyStatus } from '../firebase/models/signup.model.js';
import type { ProgPointOption } from './encounters.consts.js';
import { ThresholdError } from './errors/threshold.error.js';

@Injectable()
export class EncountersService {
  private readonly logger = new Logger(EncountersService.name);

  constructor(private readonly encountersCollection: EncountersCollection) {}

  public getProgPoints(
    guildId: string,
    encounterId: string,
  ): Promise<ProgPointDocument[]> {
    return this.encountersCollection.getProgPoints(guildId, encounterId);
  }

  public getAllProgPoints(
    guildId: string,
    encounterId: string,
  ): Promise<ProgPointDocument[]> {
    return this.encountersCollection.getAllProgPoints(guildId, encounterId);
  }

  public async getProgPointsAsOptions(
    guildId: string,
    encounterId: string,
  ): Promise<Record<string, ProgPointOption>> {
    const progPoints = await this.getProgPoints(guildId, encounterId);

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
    guildId: string,
    encounterId: string,
  ): Promise<EncounterDocument | undefined> {
    return this.encountersCollection.getEncounter(guildId, encounterId);
  }

  public async addProgPoint(
    guildId: string,
    encounterId: string,
    progPointData: {
      id: string;
      label: string;
      partyStatus: PartyStatus;
    },
  ): Promise<void> {
    const nextOrder = await this.encountersCollection.getNextProgPointOrder(
      guildId,
      encounterId,
    );

    const progPoint: ProgPointDocument = {
      ...progPointData,
      order: nextOrder,
      active: true,
    };

    await this.encountersCollection.addProgPoint(
      guildId,
      encounterId,
      progPoint,
    );
    this.logger.log(
      `Added prog point ${progPointData.id} to encounter ${encounterId}`,
    );
  }

  public async updateProgPoint(
    guildId: string,
    encounterId: string,
    progPointId: string,
    updates: Partial<Pick<ProgPointDocument, 'label' | 'partyStatus'>>,
  ): Promise<void> {
    await this.encountersCollection.updateProgPoint(
      guildId,
      encounterId,
      progPointId,
      updates,
    );
    this.logger.log(
      `Updated prog point ${progPointId} in encounter ${encounterId}`,
    );
  }

  public async deactivateProgPoint(
    guildId: string,
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    await this.encountersCollection.deactivateProgPoint(
      guildId,
      encounterId,
      progPointId,
    );
    this.logger.log(
      `Deactivated prog point ${progPointId} from encounter ${encounterId}`,
    );
  }

  public async deleteProgPoint(
    guildId: string,
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    // Enhanced validation for deletion - check threshold dependencies
    const encounter = await this.encountersCollection.getEncounter(
      guildId,
      encounterId,
    );
    const allProgPoints = await this.getAllProgPoints(guildId, encounterId);
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

    await this.encountersCollection.deleteProgPoint(
      guildId,
      encounterId,
      progPointId,
    );
    this.logger.log(
      `Permanently deleted prog point ${progPointId} from encounter ${encounterId}`,
    );
  }

  public async toggleProgPointActive(
    guildId: string,
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    // Check if prog point is used as a threshold before deactivating
    const encounter = await this.encountersCollection.getEncounter(
      guildId,
      encounterId,
    );
    const allProgPoints = await this.getAllProgPoints(guildId, encounterId);
    const progPoint = allProgPoints.find((p) => p.id === progPointId);

    if (!progPoint) {
      throw new Error(`Prog point ${progPointId} not found`);
    }

    // If we're trying to deactivate an active prog point, check threshold dependencies
    if (progPoint.active && encounter) {
      let thresholdType:
        | PartyStatus.ProgParty
        | PartyStatus.ClearParty
        | undefined;

      if (encounter.progPartyThreshold === progPointId) {
        thresholdType = PartyStatus.ProgParty;
      } else if (encounter.clearPartyThreshold === progPointId) {
        thresholdType = PartyStatus.ClearParty;
      }

      if (thresholdType) {
        throw new ThresholdError(
          progPointId,
          progPoint.label,
          thresholdType,
          encounterId,
        );
      }
    }

    await this.encountersCollection.toggleProgPointActive(
      guildId,
      encounterId,
      progPointId,
    );

    const action = progPoint.active ? 'deactivated' : 'activated';
    this.logger.log(
      `${action} prog point ${progPointId} in encounter ${encounterId}`,
    );
  }

  public async reorderProgPoints(
    guildId: string,
    encounterId: string,
    progPointIds: string[],
  ): Promise<void> {
    const progPointsWithNewOrder = progPointIds.map((id, index) => ({
      id,
      order: index,
    }));

    await this.encountersCollection.reorderProgPoints(
      guildId,
      encounterId,
      progPointsWithNewOrder,
    );
    this.logger.log(`Reordered prog points for encounter ${encounterId}`);
  }

  public async setProgPartyThreshold(
    guildId: string,
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    await this.encountersCollection.upsertEncounter(guildId, encounterId, {
      progPartyThreshold: progPointId,
    });
    this.logger.log(
      `Set prog party threshold to ${progPointId} for encounter ${encounterId}`,
    );
  }

  public async setClearPartyThreshold(
    guildId: string,
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    await this.encountersCollection.upsertEncounter(guildId, encounterId, {
      clearPartyThreshold: progPointId,
    });
    this.logger.log(
      `Set clear party threshold to ${progPointId} for encounter ${encounterId}`,
    );
  }

  public async getProgPartyThreshold(
    guildId: string,
    encounterId: string,
  ): Promise<string | undefined> {
    const encounter = await this.getEncounter(guildId, encounterId);
    return encounter?.progPartyThreshold;
  }

  public async getClearPartyThreshold(
    guildId: string,
    encounterId: string,
  ): Promise<string | undefined> {
    const encounter = await this.getEncounter(guildId, encounterId);
    return encounter?.clearPartyThreshold;
  }

  public async getPartyStatusForProgPoint(
    guildId: string,
    encounterId: string,
    progPointId: string,
  ): Promise<PartyStatus> {
    const progPoints = await this.getProgPoints(guildId, encounterId);

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
    guildId: string,
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
    await this.encountersCollection.upsertEncounter(guildId, encounterId, {
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

      await this.encountersCollection.addProgPoint(
        guildId,
        encounterId,
        progPoint,
      );
    }

    this.logger.log(
      `Initialized encounter ${encounterId} with ${encounterData.progPoints.length} prog points`,
    );
  }
}
