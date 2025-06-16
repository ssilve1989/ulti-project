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
import { MOCK_GUILD_ID, mockEvents } from './mockData.js';

export class RosterApiMock implements RosterApi {
  async assignParticipant(
    params: AssignParticipantParams,
    query: AssignParticipantQuery,
    body: AssignParticipantRequest,
  ): Promise<AssignParticipantResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Event not found');
    }

    const eventIndex = mockEvents.findIndex((e) => e.id === params.eventId);
    if (eventIndex === -1) {
      throw new Error('Event not found');
    }

    const event = mockEvents[eventIndex];

    // Check if user is team leader (in a real app, this would be more robust)
    if (event.teamLeaderId !== query.teamLeaderId) {
      throw new Error('Unauthorized: Only team leader can assign participants');
    }

    // Find the slot to assign to
    const slotIndex = event.roster.party.findIndex(
      (slot) => slot.id === body.slotId,
    );
    if (slotIndex === -1) {
      throw new Error('Slot not found');
    }

    const slot = event.roster.party[slotIndex];

    // Check if slot is already occupied
    if (slot.assignedParticipant) {
      throw new Error('Slot is already occupied');
    }

    // Create participant object
    const participant = {
      type: body.participantType,
      id: body.participantId,
      discordId: body.participantId, // In a real app, this would be resolved
      name: `Mock Participant ${body.participantId.substring(0, 8)}`,
      job: body.selectedJob,
      isConfirmed: false,
    };

    // Assign participant to slot
    event.roster.party[slotIndex] = {
      ...slot,
      assignedParticipant: participant,
    };

    // Update filled slots count
    event.roster.filledSlots = event.roster.party.filter(
      (s) => s.assignedParticipant,
    ).length;

    // Update event metadata
    event.lastModified = new Date().toISOString();
    event.version += 1;

    mockEvents[eventIndex] = event;

    return {
      ...event,
      guildId: query.guildId,
    };
  }

  async unassignParticipant(
    params: UnassignParticipantParams,
    query: UnassignParticipantQuery,
  ): Promise<UnassignParticipantResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Event not found');
    }

    const eventIndex = mockEvents.findIndex((e) => e.id === params.eventId);
    if (eventIndex === -1) {
      throw new Error('Event not found');
    }

    const event = mockEvents[eventIndex];

    // Check if user is team leader
    if (event.teamLeaderId !== query.teamLeaderId) {
      throw new Error(
        'Unauthorized: Only team leader can unassign participants',
      );
    }

    // Find the slot to unassign from
    const slotIndex = event.roster.party.findIndex(
      (slot) => slot.id === params.slotId,
    );
    if (slotIndex === -1) {
      throw new Error('Slot not found');
    }

    const slot = event.roster.party[slotIndex];

    // Check if slot has a participant
    if (!slot.assignedParticipant) {
      throw new Error('Slot is not occupied');
    }

    // Unassign participant from slot
    event.roster.party[slotIndex] = {
      ...slot,
      assignedParticipant: undefined,
    };

    // Update filled slots count
    event.roster.filledSlots = event.roster.party.filter(
      (s) => s.assignedParticipant,
    ).length;

    // Update event metadata
    event.lastModified = new Date().toISOString();
    event.version += 1;

    mockEvents[eventIndex] = event;

    return {
      ...event,
      guildId: query.guildId,
    };
  }

  async getEventRoster(
    params: GetEventRosterParams,
    query: GetEventRosterQuery,
  ): Promise<GetEventRosterResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Event not found');
    }

    const event = mockEvents.find((e) => e.id === params.eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    return {
      roster: event.roster,
      lastModified: event.lastModified,
      version: event.version,
      guildId: query.guildId,
    };
  }
}
