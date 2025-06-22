import type {
  CheckHelperAvailabilityResponse,
  CreateHelperAbsenceRequest,
  HelperAbsence,
  HelperData,
  HelperWeeklyAvailability,
  Job,
  Role,
} from '@ulti-project/shared';
import type { IBaseApi } from './base.js';

/**
 * Helpers API interface defining all helper management operations
 * Includes availability checking, absence management, and helper data retrieval
 */
export interface IHelpersApi extends IBaseApi {
  /**
   * Get all helpers for the guild
   */
  getHelpers(): Promise<HelperData[]>;

  /**
   * Get a specific helper by ID
   */
  getHelper(helperId: string): Promise<HelperData | null>;

  /**
   * Check if a helper is available for a specific time slot
   */
  checkHelperAvailability(
    helperId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<CheckHelperAvailabilityResponse>;

  /**
   * Get helper availability for a date range
   */
  getHelperAvailability(
    helperId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HelperWeeklyAvailability[]>;

  /**
   * Create a helper absence
   */
  createAbsence(
    helperId: string,
    absence: CreateHelperAbsenceRequest,
  ): Promise<HelperAbsence>;

  /**
   * Get helper absences for a date range
   */
  getAbsences(
    helperId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<HelperAbsence[]>;

  /**
   * Delete a helper absence
   */
  deleteAbsence(helperId: string, absenceId: string): Promise<void>;

  /**
   * Get helpers by job/role filters
   */
  getHelpersByJobRole(jobs?: Job[], roles?: Role[]): Promise<HelperData[]>;
}
