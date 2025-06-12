import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  type AssignParticipantParams,
  AssignParticipantParamsSchema,
  type AssignParticipantQuery,
  AssignParticipantQuerySchema,
  type AssignParticipantRequest,
  AssignParticipantRequestSchema,
  type CreateEventRequest,
  CreateEventRequestSchema,
  type DeleteEventParams,
  DeleteEventParamsSchema,
  type DeleteEventQuery,
  DeleteEventQuerySchema,
  type GetEventsQuery,
  GetEventsQuerySchema,
  type GetEventsResponse,
  type ScheduledEvent,
  type UnassignParticipantParams,
  UnassignParticipantParamsSchema,
  type UnassignParticipantQuery,
  UnassignParticipantQuerySchema,
  type UpdateEventRequest,
  UpdateEventRequestSchema,
} from '@ulti-project/shared';
import { ZodValidationPipe } from '../../utils/pipes/zod-validation.pipe.js';
import { EventsService } from './events.service.js';
import { RosterService } from './roster.service.js';

@Controller('events')
class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly rosterService: RosterService,
  ) {}

  @Get()
  getEvents(
    @Query(new ZodValidationPipe(GetEventsQuerySchema))
    query: GetEventsQuery,
  ): Promise<GetEventsResponse> {
    return this.eventsService.getEvents(query);
  }

  @Get(':id')
  async getEvent(
    @Param('id') id: string,
    @Query('guildId') guildId: string,
  ): Promise<ScheduledEvent> {
    const event = await this.eventsService.getEvent(guildId, id);
    if (!event) {
      throw new NotFoundException(`Event with id ${id} not found`);
    }
    return event;
  }

  @Post()
  async createEvent(
    @Body(new ZodValidationPipe(CreateEventRequestSchema))
    createRequest: CreateEventRequest,
  ): Promise<ScheduledEvent> {
    return this.eventsService.createEvent(createRequest.guildId, createRequest);
  }

  @Put(':id')
  async updateEvent(
    @Param('id') id: string,
    @Query('guildId') guildId: string,
    @Body(new ZodValidationPipe(UpdateEventRequestSchema))
    updateRequest: UpdateEventRequest,
  ): Promise<ScheduledEvent> {
    return this.eventsService.updateEvent(guildId, id, updateRequest);
  }

  @Delete(':id')
  async deleteEvent(
    @Param(new ZodValidationPipe(DeleteEventParamsSchema))
    params: DeleteEventParams,
    @Query(new ZodValidationPipe(DeleteEventQuerySchema))
    query: DeleteEventQuery,
  ): Promise<{ success: boolean }> {
    await this.eventsService.deleteEvent(query.guildId, params.id);
    return { success: true };
  }

  // Roster Management Endpoints

  @Post(':eventId/roster/assign')
  async assignParticipant(
    @Param(new ZodValidationPipe(AssignParticipantParamsSchema))
    params: AssignParticipantParams,
    @Query(new ZodValidationPipe(AssignParticipantQuerySchema))
    query: AssignParticipantQuery,
    @Body(new ZodValidationPipe(AssignParticipantRequestSchema))
    request: AssignParticipantRequest,
  ): Promise<ScheduledEvent> {
    return this.rosterService.assignParticipant(
      query.guildId,
      params.eventId,
      query.teamLeaderId,
      request,
    );
  }

  @Delete(':eventId/roster/slots/:slotId')
  async unassignParticipant(
    @Param(new ZodValidationPipe(UnassignParticipantParamsSchema))
    params: UnassignParticipantParams,
    @Query(new ZodValidationPipe(UnassignParticipantQuerySchema))
    query: UnassignParticipantQuery,
  ): Promise<ScheduledEvent> {
    return this.rosterService.unassignParticipant(
      query.guildId,
      params.eventId,
      params.slotId,
      query.teamLeaderId,
    );
  }
}

export { EventsController };
