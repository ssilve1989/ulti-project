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
  type CreateEventResponse,
  type DeleteEventParams,
  DeleteEventParamsSchema,
  type DeleteEventQuery,
  DeleteEventQuerySchema,
  type GetEventParams,
  GetEventParamsSchema,
  type GetEventQuery,
  GetEventQuerySchema,
  type GetEventResponse,
  type GetEventsQuery,
  GetEventsQuerySchema,
  type GetEventsResponse,
  type ScheduledEvent,
  type UnassignParticipantParams,
  UnassignParticipantParamsSchema,
  type UnassignParticipantQuery,
  UnassignParticipantQuerySchema,
  type UpdateEventParams,
  UpdateEventParamsSchema,
  type UpdateEventQuery,
  UpdateEventQuerySchema,
  type UpdateEventRequest,
  UpdateEventRequestSchema,
  type UpdateEventResponse,
} from '@ulti-project/shared';
import { ZodValidationPipe } from '../../utils/pipes/zod-validation.pipe.js';
import { EventsService } from './events.service.js';
import { RosterService } from './roster.service.js';

// Helper function to serialize event dates to ISO strings
function serializeEventDates(event: any): any {
  return {
    ...event,
    scheduledTime: event.scheduledTime.toDate().toISOString(),
    createdAt: event.createdAt.toDate().toISOString(),
    lastModified: event.lastModified.toDate().toISOString(),
    roster: {
      ...event.roster,
      party: event.roster.party.map((slot: any) => ({
        ...slot,
        draftedAt: slot.draftedAt
          ? slot.draftedAt.toDate().toISOString()
          : undefined,
      })),
    },
  };
}

@Controller('events')
class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly rosterService: RosterService,
  ) {}

  @Get()
  async getEvents(
    @Query(new ZodValidationPipe(GetEventsQuerySchema))
    query: GetEventsQuery,
  ): Promise<GetEventsResponse> {
    const result = await this.eventsService.getEvents(query);

    // Serialize dates to ISO strings
    const serializedEvents = result.events.map(serializeEventDates);

    return {
      ...result,
      events: serializedEvents,
    };
  }

  @Get(':id')
  async getEvent(
    @Param(new ZodValidationPipe(GetEventParamsSchema))
    params: GetEventParams,
    @Query(new ZodValidationPipe(GetEventQuerySchema))
    query: GetEventQuery,
  ): Promise<GetEventResponse> {
    const event = await this.eventsService.getEvent(query.guildId, params.id);
    if (!event) {
      throw new NotFoundException(`Event with id ${params.id} not found`);
    }
    return {
      ...serializeEventDates(event),
      guildId: query.guildId,
    };
  }

  @Post()
  async createEvent(
    @Body(new ZodValidationPipe(CreateEventRequestSchema))
    createRequest: CreateEventRequest,
  ): Promise<CreateEventResponse> {
    const event = await this.eventsService.createEvent(
      createRequest.guildId,
      createRequest,
    );
    return {
      ...serializeEventDates(event),
      guildId: createRequest.guildId,
    };
  }

  @Put(':id')
  async updateEvent(
    @Param(new ZodValidationPipe(UpdateEventParamsSchema))
    params: UpdateEventParams,
    @Query(new ZodValidationPipe(UpdateEventQuerySchema))
    query: UpdateEventQuery,
    @Body(new ZodValidationPipe(UpdateEventRequestSchema))
    updateRequest: UpdateEventRequest,
  ): Promise<UpdateEventResponse> {
    const event = await this.eventsService.updateEvent(
      query.guildId,
      params.id,
      updateRequest,
    );
    return {
      ...serializeEventDates(event),
      guildId: query.guildId,
    };
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
    const event = await this.rosterService.assignParticipant(
      query.guildId,
      params.eventId,
      query.teamLeaderId,
      request,
    );
    return serializeEventDates(event);
  }

  @Delete(':eventId/roster/slots/:slotId')
  async unassignParticipant(
    @Param(new ZodValidationPipe(UnassignParticipantParamsSchema))
    params: UnassignParticipantParams,
    @Query(new ZodValidationPipe(UnassignParticipantQuerySchema))
    query: UnassignParticipantQuery,
  ): Promise<ScheduledEvent> {
    const event = await this.rosterService.unassignParticipant(
      query.guildId,
      params.eventId,
      params.slotId,
      query.teamLeaderId,
    );
    return serializeEventDates(event);
  }
}

export { EventsController };
