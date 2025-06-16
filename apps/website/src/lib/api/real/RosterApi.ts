import type {
  AssignParticipantParams,
  AssignParticipantQuery,
  AssignParticipantRequest,
  AssignParticipantResponse,
  GetEventRosterParams,
  GetEventRosterQuery,
  GetEventRosterResponse,
  UnassignParticipantParams,
  UnassignParticipantQuery,
  UnassignParticipantResponse,
} from '@ulti-project/shared';
import type { RosterApi } from '../interfaces/RosterApi.js';
import { BaseApi } from './BaseApi.js';

export class RosterApiImpl extends BaseApi implements RosterApi {
  async assignParticipant(
    params: AssignParticipantParams,
    query: AssignParticipantQuery,
    body: AssignParticipantRequest,
  ): Promise<AssignParticipantResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(
      `/events/${params.eventId}/roster/assign?${queryString}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  async unassignParticipant(
    params: UnassignParticipantParams,
    query: UnassignParticipantQuery,
  ): Promise<UnassignParticipantResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(
      `/events/${params.eventId}/roster/slots/${params.slotId}?${queryString}`,
      {
        method: 'DELETE',
      },
    );
  }

  async getEventRoster(
    params: GetEventRosterParams,
    query: GetEventRosterQuery,
  ): Promise<GetEventRosterResponse> {
    // Note: This might be part of the event details endpoint
    // If there's no dedicated roster endpoint, this could be derived from event data
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(`/events/${params.eventId}?${queryString}`);
  }
}
