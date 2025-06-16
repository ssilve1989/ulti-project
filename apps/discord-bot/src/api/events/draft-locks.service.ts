import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateDraftLockRequest, DraftLock } from '@ulti-project/shared';
import { ParticipantType } from '@ulti-project/shared';
import { Observable } from 'rxjs';
import { DraftLocksCollection } from '../../firebase/collections/draft-locks.collection.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';

@Injectable()
export class DraftLocksService {
  constructor(
    private readonly draftLocksCollection: DraftLocksCollection,
    private readonly eventsCollection: EventsCollection,
  ) {}

  async getEventLocks(guildId: string, eventId: string): Promise<DraftLock[]> {
    // Verify event exists
    const event = await this.eventsCollection.getEvent(guildId, eventId);
    if (!event) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    return this.draftLocksCollection.getEventLocks(guildId, eventId);
  }

  getEventLocksStream(
    guildId: string,
    eventId: string,
  ): Observable<DraftLock[]> {
    return this.draftLocksCollection.getEventLocksStream(guildId, eventId);
  }

  async createLock(
    guildId: string,
    eventId: string,
    teamLeaderId: string,
    teamLeaderName: string,
    request: CreateDraftLockRequest,
  ): Promise<DraftLock> {
    // Verify event exists
    const event = await this.eventsCollection.getEvent(guildId, eventId);
    if (!event) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    // Check if participant is already locked
    const existingLock = await this.draftLocksCollection.findLockByParticipant(
      guildId,
      eventId,
      request.participantId,
      request.participantType,
    );

    if (existingLock) {
      if (existingLock.lockedBy === teamLeaderId) {
        // Return existing lock if same team leader
        return existingLock;
      }
      throw new ConflictException({
        message: 'Participant is locked by another team leader',
        code: 'PARTICIPANT_LOCKED',
        details: {
          currentHolder: existingLock.lockedByName,
          lockExpiresAt: existingLock.expiresAt,
        },
      });
    }

    // Create new lock
    const lockId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes

    const lock: DraftLock = {
      id: lockId,
      eventId,
      participantId: request.participantId,
      participantType: request.participantType as ParticipantType,
      lockedBy: teamLeaderId,
      lockedByName: teamLeaderName,
      lockedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    return this.draftLocksCollection.createLock(guildId, lock);
  }

  async releaseLock(
    guildId: string,
    eventId: string,
    participantType: string,
    participantId: string,
    teamLeaderId: string,
  ): Promise<void> {
    // Find the lock
    const lock = await this.draftLocksCollection.findLockByParticipant(
      guildId,
      eventId,
      participantId,
      participantType,
    );

    if (!lock) {
      throw new NotFoundException('Draft lock not found');
    }

    // Verify the team leader owns the lock
    if (lock.lockedBy !== teamLeaderId) {
      throw new ConflictException({
        message: 'Lock is held by another team leader',
        code: 'LOCK_HELD_BY_OTHER',
        details: {
          currentHolder: lock.lockedByName,
        },
      });
    }

    // Check if lock is expired
    if (new Date(lock.expiresAt) <= new Date()) {
      throw new BadRequestException({
        message: 'Draft lock has expired',
        code: 'LOCK_EXPIRED',
      });
    }

    await this.draftLocksCollection.releaseLock(guildId, lock.id);
  }

  async releaseTeamLeaderLocks(
    guildId: string,
    eventId: string,
    teamLeaderId: string,
  ): Promise<DraftLock[]> {
    // Verify event exists
    const event = await this.eventsCollection.getEvent(guildId, eventId);
    if (!event) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    return this.draftLocksCollection.releaseTeamLeaderLocks(
      guildId,
      eventId,
      teamLeaderId,
    );
  }

  async cleanupExpiredLocks(guildId: string): Promise<number> {
    return this.draftLocksCollection.cleanupExpiredLocks(guildId);
  }
}
