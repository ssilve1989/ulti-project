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
import { EventChangesBus } from '../../events/event-changes.bus.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { BoardHttpError, notFound } from '../../http/http-exception.filter.js';
import { squadMemberOf } from '../access/board-context.js';
import { BoardSessionGuard } from '../access/board-session.guard.js';
import { CanClaim } from '../access/can-claim.decorator.js';
import { squadsOf } from '../squads.js';
import { BoardEventReader } from './board-event.reader.js';
import { isEventId, isParticipantId } from './board-ids.js';

/** 404s ids that can't name an event and its participant, before they reach Firestore. */
function assertIds(id: string, pid: string): void {
  if (!isEventId(id) || !isParticipantId(pid)) throw notFound();
}

/** Squads claim players, and release their claims. */
@Controller('events/:id/participants/:pid/claim')
@UseGuards(BoardSessionGuard)
export class ClaimsController {
  constructor(
    private readonly reader: BoardEventReader,
    private readonly events: EventsCollection,
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
    const { discordId, squadId } = squadMemberOf(request);
    assertIds(id, pid);
    const outcome = await this.events.claim(
      boardConfig.GUILD_ID,
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
        throw new BoardHttpError(HttpStatus.CONFLICT, { reason: 'closed' });
      case 'claimed-by-other': {
        const { squadId, claimedBy, claimedAt } = outcome.claim;
        throw new BoardHttpError(HttpStatus.CONFLICT, {
          reason: 'claimed',
          claim: {
            squadId,
            claimedBy,
            claimedAt: claimedAt.toDate().toISOString(),
          },
        });
      }
      case 'claimed':
        this.changed(id, pid);
        break;
      case 'already-yours':
        break;
    }
    return this.reader.boardParticipant(
      boardConfig.GUILD_ID,
      outcome.participant,
    );
  }

  @Delete()
  @CanClaim()
  async release(
    @Param('id') id: string,
    @Param('pid') pid: string,
    @Req() request: Request,
  ): Promise<BoardParticipant> {
    const { squadId } = squadMemberOf(request);
    assertIds(id, pid);
    const outcome = await this.events.release(
      boardConfig.GUILD_ID,
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
        throw new BoardHttpError(HttpStatus.FORBIDDEN, {
          reason: 'not-your-claim',
        });
      case 'released':
        this.changed(id, pid);
        if (outcome.rosterChanged) {
          this.changes.publish({
            kind: 'roster',
            eventId: id,
            encounter: outcome.participant.encounter,
            squadId,
          });
        }
        break;
      case 'not-claimed':
        break;
    }
    return this.reader.boardParticipant(
      boardConfig.GUILD_ID,
      outcome.participant,
    );
  }

  /** The board guild's squads: a claim by any other squad (one removed since) counts as none. */
  private async squadIds(): Promise<string[]> {
    const settings = await this.settings.getSettings(boardConfig.GUILD_ID);
    return squadsOf(settings).map(({ id }) => id);
  }

  /**
   * Tells open boards that the claim changed. The event's Discord message
   * shows no claims, so it's left alone.
   */
  private changed(id: string, pid: string): void {
    this.changes.publish({
      kind: 'participant',
      eventId: id,
      participantId: pid,
    });
  }
}
