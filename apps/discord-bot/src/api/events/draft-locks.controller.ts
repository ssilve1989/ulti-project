import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import {
  type CreateDraftLockParams,
  CreateDraftLockParamsSchema,
  type CreateDraftLockQuery,
  CreateDraftLockQuerySchema,
  type CreateDraftLockRequest,
  CreateDraftLockRequestSchema,
  type DraftLock,
  type GetActiveLocksParams,
  GetActiveLocksParamsSchema,
  type GetActiveLocksQuery,
  GetActiveLocksQuerySchema,
  type ReleaseAllLocksParams,
  ReleaseAllLocksParamsSchema,
  type ReleaseAllLocksQuery,
  ReleaseAllLocksQuerySchema,
  type ReleaseDraftLockParams,
  ReleaseDraftLockParamsSchema,
  type ReleaseDraftLockQuery,
  ReleaseDraftLockQuerySchema,
} from '@ulti-project/shared';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ZodValidationPipe } from '../../utils/pipes/zod-validation.pipe.js';
import { DraftLocksService } from './draft-locks.service.js';

@Controller('events')
export class DraftLocksController {
  constructor(private readonly draftLocksService: DraftLocksService) {}

  @Get(':eventId/locks')
  async getEventLocks(
    @Param(new ZodValidationPipe(GetActiveLocksParamsSchema))
    params: GetActiveLocksParams,
    @Query(new ZodValidationPipe(GetActiveLocksQuerySchema))
    query: GetActiveLocksQuery,
  ): Promise<DraftLock[]> {
    return this.draftLocksService.getEventLocks(query.guildId, params.eventId);
  }

  @Post(':eventId/locks')
  async createLock(
    @Param(new ZodValidationPipe(CreateDraftLockParamsSchema))
    params: CreateDraftLockParams,
    @Query(new ZodValidationPipe(CreateDraftLockQuerySchema))
    query: CreateDraftLockQuery,
    @Body(new ZodValidationPipe(CreateDraftLockRequestSchema))
    body: CreateDraftLockRequest,
  ): Promise<DraftLock> {
    // TODO: Get team leader name from Discord API or user service
    const teamLeaderName = `Team Leader ${query.teamLeaderId}`;

    return this.draftLocksService.createLock(
      query.guildId,
      params.eventId,
      query.teamLeaderId,
      teamLeaderName,
      body,
    );
  }

  @Delete(':eventId/locks/:participantType/:participantId')
  async releaseLock(
    @Param(new ZodValidationPipe(ReleaseDraftLockParamsSchema))
    params: ReleaseDraftLockParams,
    @Query(new ZodValidationPipe(ReleaseDraftLockQuerySchema))
    query: ReleaseDraftLockQuery,
  ): Promise<{ success: boolean }> {
    await this.draftLocksService.releaseLock(
      query.guildId,
      params.eventId,
      params.participantType,
      params.participantId,
      query.teamLeaderId,
    );
    return { success: true };
  }

  @Delete(':eventId/locks/team-leader/:teamLeaderId')
  async releaseTeamLeaderLocks(
    @Param(new ZodValidationPipe(ReleaseAllLocksParamsSchema))
    params: ReleaseAllLocksParams,
    @Query(new ZodValidationPipe(ReleaseAllLocksQuerySchema))
    query: ReleaseAllLocksQuery,
  ): Promise<{ success: boolean }> {
    await this.draftLocksService.releaseTeamLeaderLocks(
      query.guildId,
      params.eventId,
      params.teamLeaderId,
    );
    return { success: true };
  }

  @Sse(':eventId/locks/stream')
  lockUpdatesStream(
    @Param(new ZodValidationPipe(GetActiveLocksParamsSchema))
    params: GetActiveLocksParams,
    @Query(new ZodValidationPipe(GetActiveLocksQuerySchema))
    query: GetActiveLocksQuery,
  ): Observable<{ data: { type: string; data: DraftLock[] } }> {
    // Use Firestore real-time listener for efficient updates
    return this.draftLocksService
      .getEventLocksStream(query.guildId, params.eventId)
      .pipe(
        map((locks: DraftLock[]) => ({
          data: {
            type: 'locks_updated',
            data: locks,
          },
        })),
      );
  }
}
