import {
  Controller,
  HttpStatus,
  type MessageEvent,
  Param,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { catchError, EMPTY, interval, map, merge, type Observable } from 'rxjs';
import { boardConfig } from '../../config/board.js';
import { ErrorService } from '../../error/error.service.js';
import { BoardHttpError } from '../../http/http-exception.filter.js';
import { BoardSessionGuard } from '../access/board-session.guard.js';
import { BoardEventReader } from './board-event.reader.js';
import { EventStreamService } from './event-stream.service.js';

/** How often an idle stream sends a comment, so proxies keep it open. */
const PING_INTERVAL_MS = 25_000;

/** An event's live board, as server-sent events. */
@Controller('events')
@UseGuards(BoardSessionGuard)
export class StreamController {
  constructor(
    private readonly reader: BoardEventReader,
    private readonly streams: EventStreamService,
    private readonly errors: ErrorService,
  ) {}

  /**
   * The event's snapshot, then its changes, each as a JSON message, with a
   * `: ping` comment every 25s. An unknown event answers 404 before the
   * stream opens. A stream that fails later is reported and ended, so the
   * browser's `EventSource` reconnects and starts from a fresh snapshot.
   */
  @Sse(':id/stream')
  async stream(@Param('id') id: string): Promise<Observable<MessageEvent>> {
    // checked before the stream opens: once it has, a 404 can't be sent
    if (
      (await this.reader.event(boardConfig.BOARD_GUILD_ID, id)) === undefined
    ) {
      throw new BoardHttpError(HttpStatus.NOT_FOUND, 'not-found');
    }
    return merge(
      this.streams
        .stream(boardConfig.BOARD_GUILD_ID, id)
        .pipe(map((message): MessageEvent => ({ data: message }))),
      interval(PING_INTERVAL_MS).pipe(
        map((): MessageEvent => ({ comment: 'ping' })),
      ),
    ).pipe(
      catchError((error: unknown) => {
        this.errors.captureError(error, {
          message: `Board stream for event ${id} failed`,
        });
        return EMPTY;
      }),
    );
  }
}
