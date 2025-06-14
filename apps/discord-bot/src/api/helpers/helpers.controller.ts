import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { HelperData } from '@ulti-project/shared';
import type { HelperAbsenceDocument } from '../../firebase/models/helper.model.js';
import { HelpersService } from './helpers.service.js';

@Controller('helpers')
export class HelpersController {
  constructor(private readonly helpersService: HelpersService) {}

  @Get()
  async getHelpers(@Query('guildId') guildId: string): Promise<HelperData[]> {
    if (!guildId) {
      throw new BadRequestException('guildId is required');
    }

    return this.helpersService.getHelpers(guildId);
  }

  @Get(':helperId')
  async getHelper(
    @Param('helperId') helperId: string,
    @Query('guildId') guildId: string,
  ): Promise<HelperData> {
    if (!guildId) {
      throw new BadRequestException('guildId is required');
    }

    return this.helpersService.getHelper(guildId, helperId);
  }

  @Get(':helperId/availability')
  async checkAvailability(
    @Param('helperId') helperId: string,
    @Query('guildId') guildId: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
  ): Promise<{
    available: boolean;
    reason?: 'absent' | 'outside_schedule' | 'available';
  }> {
    if (!guildId) {
      throw new BadRequestException('guildId is required');
    }

    if (!startTime || !endTime) {
      throw new BadRequestException('startTime and endTime are required');
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException(
        'Invalid date format for startTime or endTime',
      );
    }

    if (startDate >= endDate) {
      throw new BadRequestException('startTime must be before endTime');
    }

    return this.helpersService.checkAvailability(
      guildId,
      helperId,
      startDate,
      endDate,
    );
  }

  @Post(':helperId/availability')
  async setWeeklyAvailability(
    @Param('helperId') helperId: string,
    @Query('guildId') guildId: string,
    @Body() body: { weeklyAvailability: any[] },
  ): Promise<HelperData> {
    if (!guildId) {
      throw new BadRequestException('guildId is required');
    }

    return this.helpersService.setWeeklyAvailability(
      guildId,
      helperId,
      body.weeklyAvailability,
    );
  }

  @Get(':helperId/absences')
  async getAbsences(
    @Param('helperId') helperId: string,
    @Query('guildId') guildId: string,
  ): Promise<HelperAbsenceDocument[]> {
    if (!guildId) {
      throw new BadRequestException('guildId is required');
    }

    return this.helpersService.getAbsences(guildId, helperId);
  }

  @Post(':helperId/absences')
  async createAbsence(
    @Param('helperId') helperId: string,
    @Query('guildId') guildId: string,
    @Body() body: { startDate: string; endDate: string; reason?: string },
  ): Promise<HelperAbsenceDocument> {
    if (!guildId) {
      throw new BadRequestException('guildId is required');
    }

    if (!body.startDate || !body.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException(
        'Invalid date format for startDate or endDate',
      );
    }

    if (startDate >= endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }

    return this.helpersService.createAbsence(guildId, helperId, {
      startDate,
      endDate,
      reason: body.reason,
    });
  }
}
