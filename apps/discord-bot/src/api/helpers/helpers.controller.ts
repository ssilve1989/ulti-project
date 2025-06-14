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
      query.startTime,
      query.endTime,
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
    return this.helpersService.getAbsences(query.guildId, params.id);
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
    return this.helpersService.createAbsence(query.guildId, params.id, {
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
    });
  }
}
