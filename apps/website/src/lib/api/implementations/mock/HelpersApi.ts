import type {
  CheckHelperAvailabilityResponse,
  CreateHelperAbsenceRequest,
  HelperAbsence,
  HelperData,
  HelperWeeklyAvailability,
  Job,
  Role,
} from '@ulti-project/shared';
import {
  checkHelperAvailabilityWithGuild,
  createAbsenceWithGuild,
  getAbsencesWithGuild,
  getHelperWithGuild,
  getHelpersWithGuild,
} from '../../../mock/helpers.js';
import type { IApiContext, IHelpersApi } from '../../interfaces/index.js';

export class MockHelpersApi implements IHelpersApi {
  constructor(public readonly context: IApiContext) {}

  async getHelpers(): Promise<HelperData[]> {
    return getHelpersWithGuild(this.context.guildId);
  }

  async getHelper(helperId: string): Promise<HelperData | null> {
    return getHelperWithGuild(this.context.guildId, helperId);
  }

  async checkHelperAvailability(
    helperId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<CheckHelperAvailabilityResponse> {
    const response = await checkHelperAvailabilityWithGuild(
      this.context.guildId,
      {
        helperId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    );
    return {
      available: response.available,
      reason: response.reason as any,
    };
  }

  async getHelperAvailability(
    helperId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HelperWeeklyAvailability[]> {
    // Implementation using existing helper availability logic
    const helper = await this.getHelper(helperId);
    return helper?.weeklyAvailability || [];
  }

  async createAbsence(
    helperId: string,
    absence: CreateHelperAbsenceRequest,
  ): Promise<HelperAbsence> {
    const absenceWithReason = {
      ...absence,
      reason: absence.reason || 'No reason provided',
    };
    return createAbsenceWithGuild(
      this.context.guildId,
      helperId,
      absenceWithReason,
    );
  }

  async getAbsences(
    helperId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<HelperAbsence[]> {
    return getAbsencesWithGuild(
      this.context.guildId,
      helperId,
      startDate,
      endDate,
    );
  }

  async deleteAbsence(helperId: string, absenceId: string): Promise<void> {
    // Implementation for absence deletion
    const storageKey = `helper_absences_${helperId}`;
    const absences = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
    const filtered = absences.filter((a: any) => a.id !== absenceId);
    sessionStorage.setItem(storageKey, JSON.stringify(filtered));
  }

  async getHelpersByJobRole(
    jobs?: Job[],
    roles?: Role[],
  ): Promise<HelperData[]> {
    const helpers = await this.getHelpers();
    return helpers.filter((helper) => {
      const matchesJob =
        !jobs || helper.availableJobs.some((job) => jobs.includes(job.job));
      const matchesRole =
        !roles || helper.availableJobs.some((job) => roles.includes(job.role));
      return matchesJob && matchesRole;
    });
  }
}
