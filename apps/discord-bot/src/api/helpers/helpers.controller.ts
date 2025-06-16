import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type {
  CheckHelperAvailabilityParams,
  CheckHelperAvailabilityQuery,
  CreateHelperAbsenceParams,
  CreateHelperAbsenceQuery,
  CreateHelperAbsenceRequest,
  GetHelperAbsencesParams,
  GetHelperAbsencesQuery,
  GetHelperParams,
  GetHelperQuery,
  GetHelpersQuery,
  HelperData,
  SetHelperAvailabilityParams,
  SetHelperAvailabilityQuery,
  SetHelperAvailabilityRequest,
} from '@ulti-project/shared';
import {
  CheckHelperAvailabilityParamsSchema,
  CheckHelperAvailabilityQuerySchema,
  CreateHelperAbsenceParamsSchema,
  CreateHelperAbsenceQuerySchema,
  CreateHelperAbsenceRequestSchema,
  GetHelperAbsencesParamsSchema,
  GetHelperAbsencesQuerySchema,
  GetHelperParamsSchema,
  GetHelperQuerySchema,
  GetHelpersQuerySchema,
  SetHelperAvailabilityParamsSchema,
  SetHelperAvailabilityQuerySchema,
  SetHelperAvailabilityRequestSchema,
} from '@ulti-project/shared';
import type { HelperAbsenceDocument } from '../../firebase/models/helper.model.js';
import { ZodValidationPipe } from '../../utils/pipes/zod-validation.pipe.js';
import { HelpersService } from './helpers.service.js';

// Helper function to serialize absence dates to ISO strings
function serializeAbsenceDates(absence: any): any {
  return {
    ...absence,
    startDate: absence.startDate.toDate().toISOString(),
    endDate: absence.endDate.toDate().toISOString(),
  };
}

@Controller('helpers')
export class HelpersController {
  constructor(private readonly helpersService: HelpersService) {}

  @Get()
  async getHelpers(
    @Query(new ZodValidationPipe(GetHelpersQuerySchema))
    query: GetHelpersQuery,
  ): Promise<HelperData[]> {
    return this.helpersService.getHelpers(query.guildId);
  }

  @Get(':id')
  async getHelper(
    @Param(new ZodValidationPipe(GetHelperParamsSchema))
    params: GetHelperParams,
    @Query(new ZodValidationPipe(GetHelperQuerySchema))
    query: GetHelperQuery,
  ): Promise<HelperData> {
    return this.helpersService.getHelper(query.guildId, params.id);
  }

  @Get(':id/availability')
  async checkAvailability(
    @Param(new ZodValidationPipe(CheckHelperAvailabilityParamsSchema))
    params: CheckHelperAvailabilityParams,
    @Query(new ZodValidationPipe(CheckHelperAvailabilityQuerySchema))
    query: CheckHelperAvailabilityQuery,
  ): Promise<{
    available: boolean;
    reason?: 'absent' | 'outside_schedule' | 'available';
  }> {
    return this.helpersService.checkAvailability(
      query.guildId,
      params.id,
      new Date(query.startTime),
      new Date(query.endTime),
    );
  }

  @Post(':id/availability')
  async setWeeklyAvailability(
    @Param(new ZodValidationPipe(SetHelperAvailabilityParamsSchema))
    params: SetHelperAvailabilityParams,
    @Query(new ZodValidationPipe(SetHelperAvailabilityQuerySchema))
    query: SetHelperAvailabilityQuery,
    @Body(new ZodValidationPipe(SetHelperAvailabilityRequestSchema))
    body: SetHelperAvailabilityRequest,
  ): Promise<HelperData> {
    return this.helpersService.setWeeklyAvailability(
      query.guildId,
      params.id,
      body.weeklyAvailability,
    );
  }

  @Get(':id/absences')
  async getAbsences(
    @Param(new ZodValidationPipe(GetHelperAbsencesParamsSchema))
    params: GetHelperAbsencesParams,
    @Query(new ZodValidationPipe(GetHelperAbsencesQuerySchema))
    query: GetHelperAbsencesQuery,
  ): Promise<HelperAbsenceDocument[]> {
    const absences = await this.helpersService.getAbsences(
      query.guildId,
      params.id,
    );
    return absences.map(serializeAbsenceDates);
  }

  @Post(':id/absences')
  async createAbsence(
    @Param(new ZodValidationPipe(CreateHelperAbsenceParamsSchema))
    params: CreateHelperAbsenceParams,
    @Query(new ZodValidationPipe(CreateHelperAbsenceQuerySchema))
    query: CreateHelperAbsenceQuery,
    @Body(new ZodValidationPipe(CreateHelperAbsenceRequestSchema))
    body: CreateHelperAbsenceRequest,
  ): Promise<HelperAbsenceDocument> {
    const absence = await this.helpersService.createAbsence(
      query.guildId,
      params.id,
      {
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        reason: body.reason,
      },
    );
    return serializeAbsenceDates(absence);
  }
}
