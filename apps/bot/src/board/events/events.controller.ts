import { Controller, Get, HttpStatus, Param, UseGuards } from '@nestjs/common';
import type { BoardEvent, BoardEventSummary } from '@ulti-project/shared';
import { boardConfig } from '../../config/board.js';
import { BoardHttpError } from '../../http/http-exception.filter.js';
import { BoardSessionGuard } from '../access/board-session.guard.js';
import { BoardEventReader } from './board-event.reader.js';

@Controller('events')
@UseGuards(BoardSessionGuard)
export class EventsController {
  constructor(private readonly reader: BoardEventReader) {}

  @Get()
  list(): Promise<BoardEventSummary[]> {
    return this.reader.list(boardConfig.GUILD_ID);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<BoardEvent> {
    const event = await this.reader.get(boardConfig.GUILD_ID, id);
    if (event === undefined) {
      throw new BoardHttpError(HttpStatus.NOT_FOUND, 'not-found');
    }
    return event;
  }
}
