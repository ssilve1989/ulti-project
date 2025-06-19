import { Controller, Get, Query, Sse } from '@nestjs/common';
import type {
  GetParticipantsQuery,
  GetParticipantsStreamQuery,
  Participant,
} from '@ulti-project/shared';
import {
  GetParticipantsQuerySchema,
  GetParticipantsStreamQuerySchema,
} from '@ulti-project/shared';
import { ZodValidationPipe } from '../../utils/pipes/zod-validation.pipe.js';
import { ParticipantsService } from './participants.service.js';

@Controller('participants')
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) {}

  @Get()
  async getParticipants(
    @Query(new ZodValidationPipe(GetParticipantsQuerySchema))
    query: GetParticipantsQuery,
  ): Promise<Participant[]> {
    return this.participantsService.getParticipants(query);
  }

  @Sse('stream')
  getParticipantsStream(
    @Query(new ZodValidationPipe(GetParticipantsStreamQuerySchema))
    query: GetParticipantsStreamQuery,
  ) {
    // SSE endpoint for real-time participant updates
    return this.participantsService.getParticipantsStream(query.guildId);
  }
}
