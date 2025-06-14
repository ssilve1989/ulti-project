import { Injectable } from '@nestjs/common';
import type { HelperData } from '@ulti-project/shared';
import { HelperAbsenceCollection } from '../../firebase/collections/helper-absence.collection.js';
import { HelperCollection } from '../../firebase/collections/helper.collection.js';
import type {
  HelperAbsenceDocument,
  HelperDocument,
} from '../../firebase/models/helper.model.js';

@Injectable()
export class HelpersService {
  constructor(
    private readonly helperCollection: HelperCollection,
    private readonly helperAbsenceCollection: HelperAbsenceCollection,
  ) {}

  async getHelpers(guildId: string): Promise<HelperData[]> {
    const helpers = await this.helperCollection.getHelpers(guildId);
    return helpers.map(this.mapHelperDocumentToHelperData);
  }

  async getHelper(guildId: string, helperId: string): Promise<HelperData> {
    const helper = await this.helperCollection.getHelper(guildId, helperId);
    return this.mapHelperDocumentToHelperData(helper);
  }

  async checkAvailability(
    guildId: string,
    helperId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<{
    available: boolean;
    reason?: 'absent' | 'outside_schedule' | 'available';
  }> {
    const helper = await this.helperCollection.getHelper(guildId, helperId);

    // Check for active absences during the requested time period
    const activeAbsences = await this.helperAbsenceCollection.getActiveAbsences(
      guildId,
      helperId,
      startTime,
    );

    // Check if any absence overlaps with the requested time period
    const hasConflictingAbsence = activeAbsences.some((absence) => {
      const absenceStart = absence.startDate;
      const absenceEnd = absence.endDate;

      // Check for overlap: absence starts before endTime and ends after startTime
      return absenceStart <= endTime && absenceEnd >= startTime;
    });

    if (hasConflictingAbsence) {
      return { available: false, reason: 'absent' };
    }

    // Check weekly availability
    if (helper.weeklyAvailability && helper.weeklyAvailability.length > 0) {
      const isWithinSchedule = this.isTimeWithinWeeklySchedule(
        helper.weeklyAvailability,
        startTime,
        endTime,
      );

      if (!isWithinSchedule) {
        return { available: false, reason: 'outside_schedule' };
      }
    }

    return { available: true, reason: 'available' };
  }

  async setWeeklyAvailability(
    guildId: string,
    helperId: string,
    weeklyAvailability: HelperDocument['weeklyAvailability'],
  ): Promise<HelperData> {
    const updatedHelper = await this.helperCollection.upsertHelper(guildId, {
      id: helperId,
      weeklyAvailability,
    });

    return this.mapHelperDocumentToHelperData(updatedHelper);
  }

  async getAbsences(
    guildId: string,
    helperId: string,
  ): Promise<HelperAbsenceDocument[]> {
    return this.helperAbsenceCollection.getAbsences(guildId, helperId);
  }

  async createAbsence(
    guildId: string,
    helperId: string,
    absenceData: { startDate: Date; endDate: Date; reason?: string },
  ): Promise<HelperAbsenceDocument> {
    return this.helperAbsenceCollection.createAbsence(
      guildId,
      helperId,
      absenceData,
    );
  }

  private mapHelperDocumentToHelperData(helper: HelperDocument): HelperData {
    return {
      id: helper.id,
      discordId: helper.discordId,
      name: helper.name,
      availableJobs: helper.availableJobs,
      weeklyAvailability: helper.weeklyAvailability,
    };
  }

  private isTimeWithinWeeklySchedule(
    weeklyAvailability: HelperDocument['weeklyAvailability'],
    startTime: Date,
    endTime: Date,
  ): boolean {
    if (!weeklyAvailability || weeklyAvailability.length === 0) {
      return true; // No schedule restrictions
    }

    const startDayOfWeek = startTime.getDay();

    // For simplicity, check if the start time falls within any availability window
    // More complex logic could handle multi-day events
    const dayAvailability = weeklyAvailability.find(
      (availability) => availability.dayOfWeek === startDayOfWeek,
    );

    if (!dayAvailability) {
      return false; // No availability defined for this day
    }

    const startTimeString = this.formatTimeAsString(startTime);
    const endTimeString = this.formatTimeAsString(endTime);

    // Check if the requested time falls within any of the time ranges for that day
    return dayAvailability.timeRanges.some((range) => {
      return startTimeString >= range.start && endTimeString <= range.end;
    });
  }

  private formatTimeAsString(date: Date): string {
    return date.toTimeString().slice(0, 5); // "HH:MM" format
  }
}
