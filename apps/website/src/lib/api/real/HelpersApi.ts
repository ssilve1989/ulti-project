import type {
  CheckHelperAvailabilityParams,
  CheckHelperAvailabilityQuery,
  CheckHelperAvailabilityResponse,
  CreateHelperAbsenceParams,
  CreateHelperAbsenceQuery,
  CreateHelperAbsenceRequest,
  CreateHelperAbsenceResponse,
  GetHelperAbsencesParams,
  GetHelperAbsencesQuery,
  GetHelperAbsencesResponse,
  GetHelperParams,
  GetHelperQuery,
  GetHelperResponse,
  GetHelpersQuery,
  GetHelpersResponse,
  SetHelperAvailabilityParams,
  SetHelperAvailabilityQuery,
  SetHelperAvailabilityRequest,
  SetHelperAvailabilityResponse,
} from '@ulti-project/shared';
import type { HelpersApi } from '../interfaces/HelpersApi.js';
import { BaseApi } from './BaseApi.js';

export class HelpersApiImpl extends BaseApi implements HelpersApi {
  async getHelpers(params: GetHelpersQuery): Promise<GetHelpersResponse> {
    const queryString = this.buildQueryParams(params);
    return this.makeRequest(`/helpers?${queryString}`);
  }

  async getHelperById(
    params: GetHelperParams,
    query: GetHelperQuery,
  ): Promise<GetHelperResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(`/helpers/${params.id}?${queryString}`);
  }

  async checkHelperAvailability(
    params: CheckHelperAvailabilityParams,
    query: CheckHelperAvailabilityQuery,
  ): Promise<CheckHelperAvailabilityResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(
      `/helpers/${params.id}/availability?${queryString}`,
    );
  }

  async setHelperAvailability(
    params: SetHelperAvailabilityParams,
    query: SetHelperAvailabilityQuery,
    body: SetHelperAvailabilityRequest,
  ): Promise<SetHelperAvailabilityResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(
      `/helpers/${params.id}/availability?${queryString}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  async getHelperAbsences(
    params: GetHelperAbsencesParams,
    query: GetHelperAbsencesQuery,
  ): Promise<GetHelperAbsencesResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(`/helpers/${params.id}/absences?${queryString}`);
  }

  async createHelperAbsence(
    params: CreateHelperAbsenceParams,
    query: CreateHelperAbsenceQuery,
    body: CreateHelperAbsenceRequest,
  ): Promise<CreateHelperAbsenceResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(`/helpers/${params.id}/absences?${queryString}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
