import type { IRosterApi, IApiContext } from '../../interfaces/index.js';
import type {
  ScheduledEvent,
  AssignParticipantRequest,
  Participant,
  ParticipantType,
  Role,
  Job
} from '@ulti-project/shared';
import { BaseHttpClient } from './BaseHttpClient.js';

export class HttpRosterApi extends BaseHttpClient implements IRosterApi {
  constructor(
    config: { baseUrl: string },
    public readonly context: IApiContext
  ) {
    super(config);
  }

  async getParticipants(filters?: {
    encounter?: string;
    type?: ParticipantType;
    role?: Role;
    job?: Job;
  }): Promise<Participant[]> {
    const params: Record<string, string> = {
      guildId: this.context.guildId
    };
    
    if (filters?.encounter) params.encounter = filters.encounter;
    if (filters?.type) params.type = filters.type;
    if (filters?.role) params.role = filters.role;
    if (filters?.job) params.job = filters.job;

    return this.request<Participant[]>({
      method: 'GET',
      path: '/api/participants',
      params
    });
  }

  async getEventParticipants(eventId: string): Promise<Participant[]> {
    return this.request<Participant[]>({
      method: 'GET',
      path: `/api/events/${eventId}/participants`,
      params: { guildId: this.context.guildId }
    });
  }

  async assignParticipant(
    eventId: string,
    request: AssignParticipantRequest
  ): Promise<ScheduledEvent> {
    return this.request<ScheduledEvent>({
      method: 'POST',
      path: `/api/events/${eventId}/roster/assign`,
      params: { guildId: this.context.guildId },
      body: request
    });
  }

  async unassignParticipant(eventId: string, slotId: string): Promise<ScheduledEvent> {
    return this.request<ScheduledEvent>({
      method: 'DELETE',
      path: `/api/events/${eventId}/roster/slots/${slotId}`,
      params: { guildId: this.context.guildId }
    });
  }

  async getEventRoster(eventId: string): Promise<ScheduledEvent> {
    return this.request<ScheduledEvent>({
      method: 'GET',
      path: `/api/events/${eventId}/roster`,
      params: { guildId: this.context.guildId }
    });
  }

  async validatePartyComposition(eventId: string): Promise<{
    isValid: boolean;
    violations: string[];
    suggestions: string[];
  }> {
    return this.request<{
      isValid: boolean;
      violations: string[];
      suggestions: string[];
    }>({
      method: 'GET',
      path: `/api/events/${eventId}/roster/validate`,
      params: { guildId: this.context.guildId }
    });
  }

  async getAvailableParticipants(
    eventId: string,
    slotType: Role,
    preferredJob?: Job
  ): Promise<Participant[]> {
    const params: Record<string, string> = {
      guildId: this.context.guildId,
      slotType
    };
    
    if (preferredJob) params.preferredJob = preferredJob;

    return this.request<Participant[]>({
      method: 'GET',
      path: `/api/events/${eventId}/roster/available`,
      params
    });
  }

  async swapParticipants(
    eventId: string,
    participant1Id: string,
    participant2Id: string
  ): Promise<ScheduledEvent> {
    return this.request<ScheduledEvent>({
      method: 'POST',
      path: `/api/events/${eventId}/roster/swap`,
      params: { guildId: this.context.guildId },
      body: { participant1Id, participant2Id }
    });
  }
}