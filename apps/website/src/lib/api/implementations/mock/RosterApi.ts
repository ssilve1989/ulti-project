import type {
  AssignParticipantRequest,
  Job,
  Participant,
  ParticipantType,
  Role,
  ScheduledEvent,
} from '@ulti-project/shared';
import { getEventWithGuild, updateEventWithGuild } from '../../../mock/events.js';
import { getParticipantsWithGuild, getParticipant } from '../../../mock/participants.js';
import type { IApiContext, IRosterApi } from '../../interfaces/index.js';

export class MockRosterApi implements IRosterApi {
  constructor(public readonly context: IApiContext) {}

  async getParticipants(filters?: {
    encounter?: string;
    type?: ParticipantType;
    role?: Role;
    job?: Job;
  }): Promise<Participant[]> {
    return getParticipantsWithGuild(this.context.guildId, filters);
  }

  async getEventParticipants(eventId: string): Promise<Participant[]> {
    // For mock implementation, return participants that are assigned to the event
    const event = await getEventWithGuild(this.context.guildId, eventId);
    if (!event) return [];

    const assignedParticipants: Participant[] = [];
    for (const slot of event.roster.party) {
      if (slot.assignedParticipant) {
        assignedParticipants.push(slot.assignedParticipant);
      }
    }
    return assignedParticipants;
  }

  async assignParticipant(
    eventId: string,
    request: AssignParticipantRequest,
  ): Promise<ScheduledEvent> {
    // Get current event
    const currentEvent = await getEventWithGuild(this.context.guildId, eventId);
    if (!currentEvent) {
      throw new Error('Event not found');
    }

    // Get the actual participant data
    const participant = await getParticipant(
      request.participantId,
      request.participantType,
    );

    if (!participant) {
      throw new Error('Participant not found');
    }

    // Create a copy of the roster and update the specific slot
    const updatedRoster = {
      ...currentEvent.roster,
      party: currentEvent.roster.party.map((slot) => {
        if (slot.id === request.slotId) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { draftedBy, draftedAt, ...rest } = slot;
          return {
            ...rest,
            assignedParticipant: {
              ...participant,
              job: request.selectedJob || participant.job,
              encounter: currentEvent.encounter,
              isConfirmed: false,
            },
          };
        }
        return slot;
      }),
    };

    // Update filled slots count
    updatedRoster.filledSlots = updatedRoster.party.filter(
      (slot: any) => slot.assignedParticipant,
    ).length;

    // Use updateEvent to apply the changes
    return updateEventWithGuild(this.context.guildId, eventId, { roster: updatedRoster });
  }

  async unassignParticipant(
    eventId: string,
    slotId: string,
  ): Promise<ScheduledEvent> {
    // Get current event
    const currentEvent = await getEventWithGuild(this.context.guildId, eventId);
    if (!currentEvent) {
      throw new Error('Event not found');
    }

    // Create a copy of the roster and clear the specific slot
    const updatedRoster = {
      ...currentEvent.roster,
      party: currentEvent.roster.party.map((slot) => {
        if (slot.id === slotId) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { assignedParticipant, draftedBy, draftedAt, ...rest } = slot;
          return rest;
        }
        return slot;
      }),
    };

    // Update filled slots count
    updatedRoster.filledSlots = updatedRoster.party.filter(
      (slot: any) => slot.assignedParticipant,
    ).length;

    // Use updateEvent to apply the changes
    return updateEventWithGuild(this.context.guildId, eventId, { roster: updatedRoster });
  }

  async getEventRoster(eventId: string): Promise<ScheduledEvent> {
    const event = await getEventWithGuild(this.context.guildId, eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);
    return event;
  }

  async validatePartyComposition(eventId: string): Promise<{
    isValid: boolean;
    violations: string[];
    suggestions: string[];
  }> {
    const event = await this.getEventRoster(eventId);
    const violations: string[] = [];
    const suggestions: string[] = [];

    // Basic validation - check if all slots are filled
    const emptySlots = event.roster.party.filter(
      (slot) => !slot.assignedParticipant,
    );
    if (emptySlots.length > 0) {
      violations.push(`${emptySlots.length} slots remain unfilled`);
      suggestions.push('Fill all empty slots before proceeding');
    }

    return {
      isValid: violations.length === 0,
      violations,
      suggestions,
    };
  }

  async getAvailableParticipants(
    eventId: string,
    slotType: Role,
    preferredJob?: Job,
  ): Promise<Participant[]> {
    const filters: any = { role: slotType };
    if (preferredJob) {
      filters.job = preferredJob;
    }
    return this.getParticipants(filters);
  }

  async swapParticipants(
    eventId: string,
    participant1Id: string,
    participant2Id: string,
  ): Promise<ScheduledEvent> {
    // Mock implementation - would require complex roster management
    throw new Error(
      'swapParticipants not implemented in mock - would require complex roster management',
    );
  }
}
