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

export interface HelpersApi {
  getHelpers(params: GetHelpersQuery): Promise<GetHelpersResponse>;
  getHelperById(
    params: GetHelperParams,
    query: GetHelperQuery,
  ): Promise<GetHelperResponse>;
  checkHelperAvailability(
    params: CheckHelperAvailabilityParams,
    query: CheckHelperAvailabilityQuery,
  ): Promise<CheckHelperAvailabilityResponse>;
  setHelperAvailability(
    params: SetHelperAvailabilityParams,
    query: SetHelperAvailabilityQuery,
    body: SetHelperAvailabilityRequest,
  ): Promise<SetHelperAvailabilityResponse>;
  getHelperAbsences(
    params: GetHelperAbsencesParams,
    query: GetHelperAbsencesQuery,
  ): Promise<GetHelperAbsencesResponse>;
  createHelperAbsence(
    params: CreateHelperAbsenceParams,
    query: CreateHelperAbsenceQuery,
    body: CreateHelperAbsenceRequest,
  ): Promise<CreateHelperAbsenceResponse>;
}
