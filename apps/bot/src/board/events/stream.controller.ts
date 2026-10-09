import {
  Controller,
  HttpStatus,
  type MessageEvent,
  Param,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  catchError,
  concatMap,
  EMPTY,
  interval,
  map,
  merge,
  type Observable,
  takeWhile,
} from 'rxjs';
import { boardConfig } from '../../config/board.js';
import { ErrorService } from '../../error/error.service.js';
import { BoardHttpError } from '../../http/http-exception.filter.js';
import { BoardAccessService } from '../access/board-access.service.js';
import { boardContextOf } from '../access/board-context.js';
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
    private readonly boardAccess: BoardAccessService,
  ) {}

  /**
   * The event's snapshot, then its changes, each as a JSON message, with a
   * `: ping` comment every 25s. An unknown event answers 404 before the
   * stream opens. A stream that fails later is reported and ended, so the
   * browser's `EventSource` reconnects and starts from a fresh snapshot.
   * Each ping reads the member's access again (it's reused for up to a
   * minute), and ends the stream once they've lost it: the browser's
   * reconnect is then refused.
   */
  @Sse(':id/stream')
  async stream(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<Observable<MessageEvent>> {
    const { discordId } = boardContextOf(request);
    // checked before the stream opens: once it has, a 404 can't be sent
    if (
      (await this.reader.event(boardConfig.BOARD_GUILD_ID, id)) === undefined
    ) {
      throw new BoardHttpError(HttpStatus.NOT_FOUND, { reason: 'not-found' });
    }
    return merge(
      this.streams
        .stream(boardConfig.BOARD_GUILD_ID, id)
        .pipe(map((message): MessageEvent => ({ data: message }))),
      interval(PING_INTERVAL_MS).pipe(
        concatMap(() => this.boardAccess.resolve(discordId)),
        // undefined ends the stream: the member has lost their access
        map((access): MessageEvent | undefined =>
          access.kind === 'denied' ? undefined : { comment: 'ping' },
        ),
      ),
    ).pipe(
      takeWhile((event): event is MessageEvent => event !== undefined),
      catchError((error: unknown) => {
        this.errors.captureError(error, {
          message: `Board stream for event ${id} failed`,
        });
        return EMPTY;
      }),
    );
  }
}
