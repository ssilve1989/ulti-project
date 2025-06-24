import type { IHelpersApi, IApiContext } from '../../interfaces/index.js';
import type {
  HelperData,
  HelperAbsence,
  CheckHelperAvailabilityResponse,
  CreateHelperAbsenceRequest,
  HelperWeeklyAvailability,
  Job,
  Role
} from '@ulti-project/shared';
import { BaseHttpClient } from './BaseHttpClient.js';

export class HttpHelpersApi extends BaseHttpClient implements IHelpersApi {
  constructor(
    config: { baseUrl: string },
    public readonly context: IApiContext
  ) {
    super(config);
  }

  async getHelpers(): Promise<HelperData[]> {
    return this.request<HelperData[]>({
      method: 'GET',
      path: '/api/helpers',
      params: { guildId: this.context.guildId }
    });
  }

  async getHelper(helperId: string): Promise<HelperData | null> {
    try {
      return await this.request<HelperData>({
        method: 'GET',
        path: `/api/helpers/${helperId}`,
        params: { guildId: this.context.guildId }
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ApiError' && (error as any).isNotFound()) {
        return null;
      }
      throw error;
    }
  }

  async checkHelperAvailability(
    helperId: string,
    startTime: Date,
    endTime: Date
  ): Promise<CheckHelperAvailabilityResponse> {
    return this.request<CheckHelperAvailabilityResponse>({
      method: 'GET',
      path: `/api/helpers/${helperId}/availability`,
      params: { 
        guildId: this.context.guildId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      }
    });
  }

  async getHelperAvailability(helperId: string, startDate: Date, endDate: Date): Promise<HelperWeeklyAvailability[]> {
    return this.request<HelperWeeklyAvailability[]>({
      method: 'GET',
      path: `/api/helpers/${helperId}/availability`,
      params: {
        guildId: this.context.guildId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    });
  }

  async createAbsence(helperId: string, absence: CreateHelperAbsenceRequest): Promise<HelperAbsence> {
    return this.request<HelperAbsence>({
      method: 'POST',
      path: `/api/helpers/${helperId}/absences`,
      params: { guildId: this.context.guildId },
      body: absence
    });
  }

  async getAbsences(helperId: string, startDate?: Date, endDate?: Date): Promise<HelperAbsence[]> {
    const params: Record<string, string> = {
      guildId: this.context.guildId
    };
    if (startDate) params.startDate = startDate.toISOString();
    if (endDate) params.endDate = endDate.toISOString();

    return this.request<HelperAbsence[]>({
      method: 'GET',
      path: `/api/helpers/${helperId}/absences`,
      params
    });
  }

  async deleteAbsence(helperId: string, absenceId: string): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/api/helpers/${helperId}/absences/${absenceId}`,
      params: { guildId: this.context.guildId }
    });
  }

  async getHelpersByJobRole(jobs?: Job[], roles?: Role[]): Promise<HelperData[]> {
    const params: Record<string, string> = {
      guildId: this.context.guildId
    };
    if (jobs) params.jobs = jobs.join(',');
    if (roles) params.roles = roles.join(',');

    return this.request<HelperData[]>({
      method: 'GET',
      path: '/api/helpers',
      params
    });
  }
}