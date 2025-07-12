import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
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

  @SentryTraced()
  public getProgPoints(encounterId: string): Promise<ProgPointDocument[]> {
    return this.encountersCollection.getProgPoints(encounterId);
  }

  @SentryTraced()
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

  @SentryTraced()
  public getEncounter(
    encounterId: string,
  ): Promise<EncounterDocument | undefined> {
    return this.encountersCollection.getEncounter(encounterId);
  }

  @SentryTraced()
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

  @SentryTraced()
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

  @SentryTraced()
  public async removeProgPoint(
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    await this.encountersCollection.removeProgPoint(encounterId, progPointId);
    this.logger.log(
      `Removed prog point ${progPointId} from encounter ${encounterId}`,
    );
  }

  @SentryTraced()
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

  @SentryTraced()
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

  @SentryTraced()
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

  @SentryTraced()
  public async getProgPartyThreshold(
    encounterId: string,
  ): Promise<string | undefined> {
    const encounter = await this.getEncounter(encounterId);
    return encounter?.progPartyThreshold;
  }

  @SentryTraced()
  public async getClearPartyThreshold(
    encounterId: string,
  ): Promise<string | undefined> {
    const encounter = await this.getEncounter(encounterId);
    return encounter?.clearPartyThreshold;
  }

  @SentryTraced()
  public async getPartyStatusForProgPoint(
    encounterId: string,
    progPointId: string,
  ): Promise<PartyStatus | undefined> {
    const [encounter, progPoints] = await Promise.all([
      this.getEncounter(encounterId),
      this.getProgPoints(encounterId),
    ]);

    const progPoint = progPoints.find((p) => p.id === progPointId);
    if (!progPoint) {
      return undefined;
    }

    // If no encounter configuration exists, fall back to the prog point's individual party status
    if (
      !encounter ||
      (!encounter.progPartyThreshold && !encounter.clearPartyThreshold)
    ) {
      return progPoint.partyStatus;
    }

    // Use threshold-based determination
    return this.determinePartyStatusByThresholds(
      encounter,
      progPoint,
      progPoints,
    );
  }

  @SentryTraced()
  private determinePartyStatusByThresholds(
    encounter: EncounterDocument,
    progPoint: ProgPointDocument,
    allProgPoints: ProgPointDocument[],
  ): PartyStatus {
    // Sort prog points by order to determine progression
    const sortedProgPoints = allProgPoints.sort((a, b) => a.order - b.order);

    const progPointIndex = sortedProgPoints.findIndex(
      (p) => p.id === progPoint.id,
    );

    // Find threshold indices
    const progThresholdIndex = encounter.progPartyThreshold
      ? sortedProgPoints.findIndex((p) => p.id === encounter.progPartyThreshold)
      : -1;

    const clearThresholdIndex = encounter.clearPartyThreshold
      ? sortedProgPoints.findIndex(
          (p) => p.id === encounter.clearPartyThreshold,
        )
      : -1;

    // Determine party status based on thresholds
    if (clearThresholdIndex !== -1 && progPointIndex >= clearThresholdIndex) {
      return PartyStatus.ClearParty;
    }

    if (progThresholdIndex !== -1 && progPointIndex >= progThresholdIndex) {
      return PartyStatus.ProgParty;
    }

    // Default to early prog party if below both thresholds
    return PartyStatus.EarlyProgParty;
  }

  @SentryTraced()
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
