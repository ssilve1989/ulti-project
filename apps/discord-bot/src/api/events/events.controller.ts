import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import type { ScheduledEvent } from '@ulti-project/shared';
import { EventsCollection } from '../../firebase/collections/events.collection.js';

@Controller('events')
class EventsController {
  constructor(private readonly eventsCollection: EventsCollection) {}

  @Get()
  async getEvents(): Promise<ScheduledEvent[]> {
    return this.eventsCollection.getEvents();
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
