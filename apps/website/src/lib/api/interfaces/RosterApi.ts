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

export interface RosterApi {
  assignParticipant(
    params: AssignParticipantParams,
    query: AssignParticipantQuery,
    body: AssignParticipantRequest,
  ): Promise<AssignParticipantResponse>;
  unassignParticipant(
    params: UnassignParticipantParams,
    query: UnassignParticipantQuery,
  ): Promise<UnassignParticipantResponse>;
  getEventRoster(
    params: GetEventRosterParams,
    query: GetEventRosterQuery,
  ): Promise<GetEventRosterResponse>;
}
