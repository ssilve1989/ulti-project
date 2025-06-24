import type { ILocksApi, IApiContext } from '../../interfaces/index.js';
import type {
  DraftLock,
  CreateDraftLockRequest,
  ParticipantType
} from '@ulti-project/shared';
import { BaseHttpClient } from './BaseHttpClient.js';

export class HttpLocksApi extends BaseHttpClient implements ILocksApi {
  constructor(
    config: { baseUrl: string },
    public readonly context: IApiContext
  ) {
    super(config);
  }

  async lockParticipant(
    eventId: string,
    request: CreateDraftLockRequest
  ): Promise<DraftLock> {
    return this.request<DraftLock>({
      method: 'POST',
      path: `/api/events/${eventId}/locks`,
      params: { guildId: this.context.guildId },
      body: request
    });
  }

  async releaseLock(
    eventId: string,
    participantType: ParticipantType,
    participantId: string
  ): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/api/events/${eventId}/locks/${participantType}/${participantId}`,
      params: { guildId: this.context.guildId }
    });
  }

  async getActiveLocks(eventId: string): Promise<DraftLock[]> {
    return this.request<DraftLock[]>({
      method: 'GET',
      path: `/api/events/${eventId}/locks`,
      params: { guildId: this.context.guildId }
    });
  }

  async getLocksForTeamLeader(
    eventId: string,
    teamLeaderId: string
  ): Promise<DraftLock[]> {
    return this.request<DraftLock[]>({
      method: 'GET',
      path: `/api/events/${eventId}/locks/team-leader/${teamLeaderId}`,
      params: { guildId: this.context.guildId }
    });
  }

  async releaseAllLocks(eventId: string, teamLeaderId: string): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/api/events/${eventId}/locks/team-leader/${teamLeaderId}`,
      params: { guildId: this.context.guildId }
    });
  }

  async isParticipantLocked(
    eventId: string,
    participantId: string
  ): Promise<{
    isLocked: boolean;
    lockInfo?: DraftLock;
  }> {
    return this.request<{
      isLocked: boolean;
      lockInfo?: DraftLock;
    }>({
      method: 'GET',
      path: `/api/events/${eventId}/locks/participant/${participantId}`,
      params: { guildId: this.context.guildId }
    });
  }

  async extendLock(eventId: string, lockId: string): Promise<DraftLock> {
    return this.request<DraftLock>({
      method: 'PATCH',
      path: `/api/events/${eventId}/locks/${lockId}/extend`,
      params: { guildId: this.context.guildId }
    });
  }

  getEventLocksStream(eventId: string): EventSource {
    const url = new URL(`/api/events/${eventId}/locks/stream`, this.config.baseUrl);
    url.searchParams.set('guildId', this.context.guildId);
    
    return new EventSource(url.toString(), {
      withCredentials: true
    });
  }
}