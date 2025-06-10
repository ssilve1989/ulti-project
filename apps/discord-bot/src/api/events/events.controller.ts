import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  type GetEventsQuery,
  GetEventsQuerySchema,
  type GetEventsResponse,
  type ScheduledEvent,
} from '@ulti-project/shared';
import { ZodValidationPipe } from '../../utils/pipes/zod-validation.pipe.js';
import { EventsService } from './events.service.js';

@Controller('events')
class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async getEvents(
    @Query(new ZodValidationPipe(GetEventsQuerySchema))
    query: GetEventsQuery,
  ): Promise<GetEventsResponse> {
    return this.eventsService.getEvents(query);
  }

  @Get(':id')
  async getEvent(@Param('id') id: string): Promise<ScheduledEvent> {
    throw new Error('Not implemented');
  }

  @Post()
  async createEvent(@Body() event: ScheduledEvent): Promise<ScheduledEvent> {
    throw new Error('Not implemented');
  }

  @Put(':id')
  async updateEvent(
    @Param('id') id: string,
    @Body() event: ScheduledEvent,
  ): Promise<ScheduledEvent> {
    throw new Error('Not implemented');
  }

  @Delete(':id')
  async deleteEvent(@Param('id') id: string): Promise<void> {
    throw new Error('Not implemented');
  }
}

export { EventsController };
