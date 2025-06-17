import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AssignParticipantRequest,
  PartySlot,
  ScheduledEvent,
} from '@ulti-project/shared';
import { Job, Role } from '@ulti-project/shared';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { DraftLocksService } from './draft-locks.service.js';

@Injectable()
export class RosterService {
  constructor(
    private readonly eventsCollection: EventsCollection,
    private readonly draftLocksService: DraftLocksService,
    private readonly participantsService: ParticipantsService,
  ) {}

  async assignParticipant(
    guildId: string,
    eventId: string,
    teamLeaderId: string,
    request: AssignParticipantRequest,
  ): Promise<ScheduledEvent> {
    // Get the event
    const event = await this.eventsCollection.getEvent(guildId, eventId);
    if (!event) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    // Validate the slot exists
    const slot = event.roster.party.find((s) => s.id === request.slotId);
    if (!slot) {
      throw new NotFoundException(
        `Roster slot with id ${request.slotId} not found`,
      );
    }

    // Check if slot is already filled
    if (slot.assignedParticipant) {
      throw new ConflictException('Roster slot is already assigned');
    }

    // Validate that the participant exists and is available
    const participants = await this.participantsService.getParticipants({
      guildId,
      type: request.participantType,
    });

    const participant = participants.find(
      (p) => p.id === request.participantId,
    );
    if (!participant) {
      throw new NotFoundException(
        `Participant with id ${request.participantId} not found`,
      );
    }

    // Validate job compatibility with slot role
    if (!this.isJobCompatibleWithRole(request.selectedJob, slot.role)) {
      throw new BadRequestException(
        `Job ${request.selectedJob} is not compatible with role ${slot.role}`,
      );
    }

    // Check if participant is locked by another team leader
    const locks = await this.draftLocksService.getEventLocks(guildId, eventId);
    const participantLock = locks.find(
      (lock) =>
        lock.participantId === request.participantId &&
        lock.participantType === request.participantType,
    );

    if (participantLock && participantLock.lockedBy !== teamLeaderId) {
      throw new ConflictException(
        `Participant is locked by another team leader: ${participantLock.lockedByName}`,
      );
    }

    // Update the roster slot
    const updatedSlot: PartySlot = {
      ...slot,
      assignedParticipant: {
        ...participant,
        job: request.selectedJob, // Use the selected job for this assignment
      },
      draftedBy: teamLeaderId,
      draftedAt: new Date().toISOString(),
    };

    // Update the roster
    const updatedParty = event.roster.party.map((s) =>
      s.id === request.slotId ? updatedSlot : s,
    );

    const updatedRoster = {
      ...event.roster,
      party: updatedParty,
      filledSlots: updatedParty.filter((s) => s.assignedParticipant).length,
    };

    // Update the event
    const updatedEvent: ScheduledEvent = {
      ...event,
      roster: updatedRoster,
      lastModified: new Date().toISOString(),
      version: event.version + 1,
    };

    // Save the updated event
    const savedEvent = await this.eventsCollection.updateEvent(
      guildId,
      eventId,
      updatedEvent,
    );

    // Release the draft lock if it exists
    if (participantLock) {
      await this.draftLocksService.releaseLock(
        guildId,
        eventId,
        request.participantType,
        request.participantId,
        teamLeaderId,
      );
    }

    return savedEvent;
  }

  async unassignParticipant(
    guildId: string,
    eventId: string,
    slotId: string,
    teamLeaderId: string,
  ): Promise<ScheduledEvent> {
    // Get the event
    const event = await this.eventsCollection.getEvent(guildId, eventId);
    if (!event) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    // Validate the slot exists
    const slot = event.roster.party.find((s) => s.id === slotId);
    if (!slot) {
      throw new NotFoundException(`Roster slot with id ${slotId} not found`);
    }

    // Check if slot is empty
    if (!slot.assignedParticipant) {
      throw new BadRequestException('Roster slot is not assigned');
    }

    // Validate that only the team leader who assigned can unassign
    if (slot.draftedBy && slot.draftedBy !== teamLeaderId) {
      throw new ConflictException(
        'Only the team leader who assigned this participant can unassign them',
      );
    }

    // Update the roster slot
    const updatedSlot: PartySlot = {
      ...slot,
      assignedParticipant: undefined,
      draftedBy: undefined,
      draftedAt: undefined,
    };

    // Update the roster
    const updatedParty = event.roster.party.map((s) =>
      s.id === slotId ? updatedSlot : s,
    );

    const updatedRoster = {
      ...event.roster,
      party: updatedParty,
      filledSlots: updatedParty.filter((s) => s.assignedParticipant).length,
    };

    // Update the event
    const updatedEvent: ScheduledEvent = {
      ...event,
      roster: updatedRoster,
      lastModified: new Date().toISOString(),
      version: event.version + 1,
    };

    // Save the updated event
    return this.eventsCollection.updateEvent(guildId, eventId, updatedEvent);
  }

  /**
   * Create empty roster slots for a new event
   * FFXIV party composition: 2 tanks, 2 healers, 4 DPS
   */
  createEmptyRoster(): PartySlot[] {
    const slots: PartySlot[] = [];

    // Tank slots (2)
    for (let i = 0; i < 2; i++) {
      slots.push({
        id: randomUUID(),
        role: Role.Tank,
        assignedParticipant: undefined,
        isHelperSlot: false,
      });
    }

    // Healer slots (2)
    for (let i = 0; i < 2; i++) {
      slots.push({
        id: randomUUID(),
        role: Role.Healer,
        assignedParticipant: undefined,
        isHelperSlot: false,
      });
    }

    // DPS slots (4)
    for (let i = 0; i < 4; i++) {
      slots.push({
        id: randomUUID(),
        role: Role.DPS,
        assignedParticipant: undefined,
        isHelperSlot: false,
      });
    }

    return slots;
  }

  private isJobCompatibleWithRole(job: Job, role: Role): boolean {
    const tankJobs = [Job.Paladin, Job.Warrior, Job.DarkKnight, Job.Gunbreaker];
    const healerJobs = [Job.WhiteMage, Job.Scholar, Job.Astrologian, Job.Sage];
    const dpsJobs = [
      // Melee DPS
      Job.Dragoon,
      Job.Monk,
      Job.Ninja,
      Job.Samurai,
      Job.Reaper,
      Job.Viper,
      // Ranged Physical DPS
      Job.Bard,
      Job.Machinist,
      Job.Dancer,
      // Ranged Magical DPS
      Job.BlackMage,
      Job.Summoner,
      Job.RedMage,
      Job.Pictomancer,
    ];

    switch (role) {
      case Role.Tank:
        return tankJobs.includes(job);
      case Role.Healer:
        return healerJobs.includes(job);
      case Role.DPS:
        return dpsJobs.includes(job);
      default:
        return false;
    }
  }
}
