import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { BoardParticipant } from '@ulti-project/shared';
import type { Request } from 'express';
import { boardConfig } from '../../config/board.js';
import { ErrorService } from '../../error/error.service.js';
import { EventChangesBus } from '../../events/event-changes.bus.js';
import { EventMessageService } from '../../events/event-message.service.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { BoardHttpError } from '../../http/http-exception.filter.js';
import { boardContextOf } from '../access/board-context.js';
import { BoardSessionGuard } from '../access/board-session.guard.js';
import { CanClaim } from '../access/can-claim.decorator.js';
import { squadsOf } from '../squads.js';
import { BoardEventReader } from './board-event.reader.js';
import { isParticipantId } from './board-ids.js';

const notFound = () => new BoardHttpError(HttpStatus.NOT_FOUND, 'not-found');

/** Squads claim players, and release their claims. */
@Controller('events/:id/participants/:pid/claim')
@UseGuards(BoardSessionGuard)
export class ClaimsController {
  constructor(
    private readonly reader: BoardEventReader,
    private readonly events: EventsCollection,
    private readonly messages: EventMessageService,
    private readonly errors: ErrorService,
    private readonly changes: EventChangesBus,
    private readonly settings: SettingsCollection,
  ) {}

  @Post()
  @CanClaim()
  @HttpCode(HttpStatus.OK)
  async claim(
    @Param('id') id: string,
    @Param('pid') pid: string,
    @Req() request: Request,
  ): Promise<BoardParticipant> {
    const { discordId, squadId } = this.claimant(request);
    await this.assertOwnParticipant(id, pid);
    const outcome = await this.events.claim(
      id,
      pid,
      squadId,
      discordId,
      new Date(),
      await this.squadIds(),
    );
    switch (outcome.kind) {
      case 'event-missing':
      case 'participant-missing':
        throw notFound();
      case 'event-closed':
        throw new BoardHttpError(HttpStatus.CONFLICT, 'closed');
      case 'claimed-by-other': {
        const { squadId, claimedBy, claimedAt } = outcome.claim;
        throw new BoardHttpError(HttpStatus.CONFLICT, 'claimed', {
          claim: {
            squadId,
            claimedBy,
            claimedAt: claimedAt.toDate().toISOString(),
          },
        });
      }
      case 'claimed':
        await this.changed(id, pid);
        break;
      case 'already-yours':
        break;
    }
    return this.participant(id, pid);
  }

  @Delete()
  @CanClaim()
  async release(
    @Param('id') id: string,
    @Param('pid') pid: string,
    @Req() request: Request,
  ): Promise<BoardParticipant> {
    const { squadId } = this.claimant(request);
    await this.assertOwnParticipant(id, pid);
    const outcome = await this.events.release(
      id,
      pid,
      squadId,
      await this.squadIds(),
    );
    switch (outcome.kind) {
      case 'event-missing':
      case 'participant-missing':
        throw notFound();
      case 'claimed-by-other':
        throw new BoardHttpError(HttpStatus.FORBIDDEN, 'not-your-claim');
      case 'released':
        await this.changed(id, pid);
        break;
      case 'not-claimed':
        break;
    }
    return this.participant(id, pid);
  }

  /** Who is claiming, for which squad; `@CanClaim` lets only a squad's members through. */
  private claimant(request: Request): { discordId: string; squadId: string } {
    const { discordId, access } = boardContextOf(request);
    if (access.kind !== 'squad') {
      throw new Error('A claim route is missing @CanClaim');
    }
    return { discordId, squadId: access.squad.id };
  }

  /** The board guild's squads: a claim by any other squad (one removed since) counts as none. */
  private async squadIds(): Promise<string[]> {
    const settings = await this.settings.getSettings(
      boardConfig.BOARD_GUILD_ID,
    );
    return squadsOf(settings).map(({ id }) => id);
  }

  /** 404s unless the ids are a participant's of an event in the board's guild. */
  private async assertOwnParticipant(id: string, pid: string): Promise<void> {
    if (
      !isParticipantId(pid) ||
      (await this.reader.event(boardConfig.GUILD_ID, id)) === undefined
    ) {
      throw notFound();
    }
  }

  private async participant(
    id: string,
    pid: string,
  ): Promise<BoardParticipant> {
    const participant = await this.reader.participant(
      boardConfig.GUILD_ID,
      id,
      pid,
    );
    if (participant === undefined) throw notFound();
    return participant;
  }

  /**
   * Tells the board and the event's message that the claim changed. It has
   * changed either way, so a message that can't be updated is only reported.
   */
  private async changed(id: string, pid: string): Promise<void> {
    this.changes.publish({
      kind: 'participant',
      eventId: id,
      participantId: pid,
    });
    await this.messages.refresh(id).catch((error: unknown) =>
      this.errors.captureError(error, {
        message: `Failed to refresh event ${id} after a claim changed`,
      }),
    );
  }
}
