import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type BoardRoster,
  type Encounter,
  isEncounter,
  isRosterSlot,
  type RosterSlot,
} from '@ulti-project/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { boardConfig } from '../../config/board.js';
import { DiscordService } from '../../discord/discord.service.js';
import { EventChangesBus } from '../../events/event-changes.bus.js';
import {
  type RosterOutcome,
  RostersCollection,
  type SlotPick,
} from '../../firebase/collections/rosters.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type { RosterDocument } from '../../firebase/models/roster.model.js';
import { BoardHttpError } from '../../http/http-exception.filter.js';
import { boardContextOf } from '../access/board-context.js';
import { BoardSessionGuard } from '../access/board-session.guard.js';
import { CanClaim } from '../access/can-claim.decorator.js';
import { squadsOf } from '../squads.js';
import { BoardEventReader } from './board-event.reader.js';
import { isParticipantId } from './board-ids.js';

const notFound = () =>
  new BoardHttpError(HttpStatus.NOT_FOUND, { reason: 'not-found' });

/** What a lead puts in a slot: a progger by their participant id, or a helper by their Discord id. */
const SlotBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('progger'),
    participantId: z.string().refine(isParticipantId),
  }),
  z.object({
    kind: z.literal('helper'),
    discordId: z.string().regex(/^\d{17,20}$/),
  }),
]);

/** A squad's leads build their teams for an encounter of an event. */
@Controller('events/:id/rosters/:encounter')
@UseGuards(BoardSessionGuard)
export class RostersController {
  constructor(
    private readonly reader: BoardEventReader,
    private readonly rosters: RostersCollection,
    private readonly changes: EventChangesBus,
    private readonly settings: SettingsCollection,
    private readonly discord: DiscordService,
  ) {}

  @Post('teams')
  @CanClaim()
  @HttpCode(HttpStatus.OK)
  async addTeam(
    @Param('id') id: string,
    @Param('encounter') encounter: string,
    @Req() request: Request,
  ): Promise<BoardRoster> {
    const squadId = squadOf(request);
    const known = await this.encounterOf(id, encounter);
    return this.answer(
      id,
      await this.rosters.addTeam(
        id,
        known,
        squadId,
        boardConfig.GUILD_ID,
        randomUUID().slice(0, 8),
      ),
    );
  }

  @Delete('teams/:teamId')
  @CanClaim()
  async removeTeam(
    @Param('id') id: string,
    @Param('encounter') encounter: string,
    @Param('teamId') teamId: string,
    @Req() request: Request,
  ): Promise<BoardRoster> {
    const squadId = squadOf(request);
    const known = await this.encounterOf(id, encounter);
    return this.answer(
      id,
      await this.rosters.removeTeam(id, known, squadId, teamId),
    );
  }

  @Put('teams/:teamId/slots/:slot')
  @CanClaim()
  async fillSlot(
    @Param('id') id: string,
    @Param('encounter') encounter: string,
    @Param('teamId') teamId: string,
    @Param('slot') slot: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<BoardRoster> {
    const squadId = squadOf(request);
    const known = await this.encounterOf(id, encounter);
    const rosterSlot = slotOf(slot);
    const parsed = SlotBody.safeParse(body);
    if (!parsed.success) {
      throw new BoardHttpError(HttpStatus.BAD_REQUEST, {
        reason: 'bad-request',
      });
    }
    const pick: SlotPick =
      parsed.data.kind === 'helper'
        ? await this.helper(squadId, parsed.data.discordId)
        : parsed.data;
    return this.answer(
      id,
      await this.rosters.fillSlot(id, known, squadId, teamId, rosterSlot, pick),
    );
  }

  @Delete('teams/:teamId/slots/:slot')
  @CanClaim()
  async clearSlot(
    @Param('id') id: string,
    @Param('encounter') encounter: string,
    @Param('teamId') teamId: string,
    @Param('slot') slot: string,
    @Req() request: Request,
  ): Promise<BoardRoster> {
    const squadId = squadOf(request);
    const known = await this.encounterOf(id, encounter);
    return this.answer(
      id,
      await this.rosters.clearSlot(id, known, squadId, teamId, slotOf(slot)),
    );
  }

  /** 404s unless the event is the board guild's and has the encounter. */
  private async encounterOf(id: string, encounter: string): Promise<Encounter> {
    const event = await this.reader.event(boardConfig.GUILD_ID, id);
    if (
      event === undefined ||
      !isEncounter(encounter) ||
      !event.encounters.includes(encounter)
    ) {
      throw notFound();
    }
    return encounter;
  }

  /** The member as a helper, named as the guild shows them; 403s unless they hold the squad's role. */
  private async helper(squadId: string, discordId: string): Promise<SlotPick> {
    const [settings, member] = await Promise.all([
      this.settings.getSettings(boardConfig.GUILD_ID),
      this.discord.getGuildMember({
        memberId: discordId,
        guildId: boardConfig.GUILD_ID,
      }),
    ]);
    const squad = squadsOf(settings).find(({ id }) => id === squadId);
    if (!squad || !member?.roles.cache.has(squad.roleId)) {
      throw new BoardHttpError(HttpStatus.FORBIDDEN, {
        reason: 'not-a-helper',
      });
    }
    return { kind: 'helper', discordId, displayName: member.displayName };
  }

  /** The written roster, telling open boards; or the error for why it wasn't written. */
  private answer(id: string, outcome: RosterOutcome): BoardRoster {
    switch (outcome.kind) {
      case 'event-missing':
      case 'team-missing':
        throw notFound();
      case 'event-closed':
        throw new BoardHttpError(HttpStatus.CONFLICT, { reason: 'closed' });
      case 'team-limit':
      case 'team-not-empty':
      case 'not-claimed':
        throw new BoardHttpError(HttpStatus.CONFLICT, { reason: outcome.kind });
      case 'ok':
        return this.changed(id, outcome.roster);
    }
  }

  private changed(
    id: string,
    { encounter, squadId, teams }: RosterDocument,
  ): BoardRoster {
    this.changes.publish({ kind: 'roster', eventId: id, encounter, squadId });
    return { encounter, squadId, teams };
  }
}

/** The caller's squad; `@CanClaim` lets only a squad's members through. */
function squadOf(request: Request): string {
  const { access } = boardContextOf(request);
  if (access.kind !== 'squad') {
    throw new Error('A roster route is missing @CanClaim');
  }
  return access.squad.id;
}

function slotOf(slot: string): RosterSlot {
  if (!isRosterSlot(slot)) throw notFound();
  return slot;
}
