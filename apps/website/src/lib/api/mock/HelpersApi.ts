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
import { MOCK_GUILD_ID, mockHelperAbsences, mockHelpers } from './mockData.js';

export class HelpersApiMock implements HelpersApi {
  async getHelpers(params: GetHelpersQuery): Promise<GetHelpersResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (params.guildId !== MOCK_GUILD_ID) {
      return {
        helpers: [],
        total: 0,
        hasMore: false,
      };
    }

    let filteredHelpers = [...mockHelpers];

    // Apply filters
    if (params.role) {
      filteredHelpers = filteredHelpers.filter((helper) =>
        helper.availableJobs.some((job) => job.role === params.role),
      );
    }
    if (params.job) {
      filteredHelpers = filteredHelpers.filter((helper) =>
        helper.availableJobs.some((job) => job.job === params.job),
      );
    }
    if (params.encounter) {
      // In a real app, this would filter by helper experience with encounters
      // For mock, we'll return all helpers
    }
    if (params.available !== undefined) {
      // In a real app, this would check current availability
      // For mock, we'll return all helpers
    }

    // Apply pagination
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    const paginatedHelpers = filteredHelpers.slice(offset, offset + limit);

    const helpers = paginatedHelpers.map((helper) => ({
      ...helper,
      guildId: params.guildId,
    }));

    return {
      helpers,
      total: filteredHelpers.length,
      hasMore: offset + limit < filteredHelpers.length,
    };
  }

  async getHelperById(
    params: GetHelperParams,
    query: GetHelperQuery,
  ): Promise<GetHelperResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Helper not found');
    }

    const helper = mockHelpers.find((h) => h.id === params.id);
    if (!helper) {
      throw new Error('Helper not found');
    }

    return {
      ...helper,
      guildId: query.guildId,
    };
  }

  async checkHelperAvailability(
    params: CheckHelperAvailabilityParams,
    query: CheckHelperAvailabilityQuery,
  ): Promise<CheckHelperAvailabilityResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Helper not found');
    }

    const helper = mockHelpers.find((h) => h.id === params.id);
    if (!helper) {
      throw new Error('Helper not found');
    }

    // Check if helper has any absences during the requested time
    const helperAbsences = mockHelperAbsences.get(helper.id) || [];
    const startTime = new Date(query.startTime);
    const endTime = new Date(query.endTime);

    const hasConflictingAbsence = helperAbsences.some((absence) => {
      const absenceStart = new Date(absence.startDate);
      const absenceEnd = new Date(absence.endDate);
      return startTime <= absenceEnd && endTime >= absenceStart;
    });

    if (hasConflictingAbsence) {
      return {
        available: false,
        reason: 'absent',
      };
    }

    // Check weekly availability (simplified for mock)
    const dayOfWeek = startTime.getDay();
    const hasAvailability =
      helper.weeklyAvailability?.some(
        (avail) => avail.dayOfWeek === dayOfWeek,
      ) ?? false;

    return {
      available: hasAvailability,
      reason: hasAvailability ? 'available' : 'outside_schedule',
    };
  }

  async setHelperAvailability(
    params: SetHelperAvailabilityParams,
    query: SetHelperAvailabilityQuery,
    body: SetHelperAvailabilityRequest,
  ): Promise<SetHelperAvailabilityResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Helper not found');
    }

    const helperIndex = mockHelpers.findIndex((h) => h.id === params.id);
    if (helperIndex === -1) {
      throw new Error('Helper not found');
    }

    // Update helper availability
    mockHelpers[helperIndex] = {
      ...mockHelpers[helperIndex],
      weeklyAvailability: body.weeklyAvailability,
    };

    return {
      ...mockHelpers[helperIndex],
      guildId: query.guildId,
    };
  }

  async getHelperAbsences(
    params: GetHelperAbsencesParams,
    query: GetHelperAbsencesQuery,
  ): Promise<GetHelperAbsencesResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (query.guildId !== MOCK_GUILD_ID) {
      return [];
    }

    const helperAbsences = mockHelperAbsences.get(params.id) || [];
    let filteredAbsences = [...helperAbsences];

    // Apply date filters
    if (query.startDate) {
      const startDate = new Date(query.startDate);
      filteredAbsences = filteredAbsences.filter(
        (absence) => new Date(absence.endDate) >= startDate,
      );
    }
    if (query.endDate) {
      const endDate = new Date(query.endDate);
      filteredAbsences = filteredAbsences.filter(
        (absence) => new Date(absence.startDate) <= endDate,
      );
    }

    // Sort by start date
    filteredAbsences.sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    const absences = filteredAbsences.map((absence) => ({
      ...absence,
      guildId: query.guildId,
    }));

    return absences;
  }

  async createHelperAbsence(
    params: CreateHelperAbsenceParams,
    query: CreateHelperAbsenceQuery,
    body: CreateHelperAbsenceRequest,
  ): Promise<CreateHelperAbsenceResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Helper not found');
    }

    const helper = mockHelpers.find((h) => h.id === params.id);
    if (!helper) {
      throw new Error('Helper not found');
    }

    const newAbsence = {
      id: Math.random().toString(36).substr(2, 9),
      helperId: params.id,
      startDate:
        typeof body.startDate === 'string'
          ? body.startDate
          : new Date(body.startDate).toISOString(),
      endDate:
        typeof body.endDate === 'string'
          ? body.endDate
          : new Date(body.endDate).toISOString(),
      reason: body.reason,
      guildId: query.guildId,
    };

    // Add to mock storage
    const existingAbsences = mockHelperAbsences.get(params.id) || [];
    mockHelperAbsences.set(params.id, [...existingAbsences, newAbsence]);

    return newAbsence;
  }
}
