import { Controller, Get, Query, Sse } from '@nestjs/common';
import type {
  GetParticipantsQuery,
  Participant,
} from '@ulti-project/shared/types';
import { ParticipantsService } from './participants.service.js';

@Controller('participants')
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) {}

  @Get()
  async getParticipants(
    @Query() query: GetParticipantsQuery,
  ): Promise<Participant[]> {
    return this.participantsService.getParticipants(query);
  }

  @Sse('stream')
  getParticipantsStream(@Query() query: { guildId: string }) {
    // SSE endpoint for real-time participant updates
    return this.participantsService.getParticipantsStream(query.guildId);
  }
}
