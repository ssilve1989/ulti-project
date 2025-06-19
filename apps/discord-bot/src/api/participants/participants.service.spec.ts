import { Job, ParticipantType } from '@ulti-project/shared';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignupStatus } from '../../firebase/models/signup.model.js';
import { ParticipantsService } from './participants.service.js';

// Mock the dependencies
const mockSignupCollection = {
  findAll: vi.fn(),
} as any;

const mockSignupCache = {
  getStream: vi.fn(),
} as any;

describe('ParticipantsService', () => {
  let service: ParticipantsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ParticipantsService(mockSignupCollection, mockSignupCache);
  });

  describe('getParticipants', () => {
    it('should return approved signups as proggers', async () => {
      const mockSignups = [
        {
          discordId: '123',
          username: 'TestUser',
          character: 'Test Character',
          role: 'pld',
          encounter: 'DSR',
          progPoint: 'Nidhogg',
          availability: 'Weekends',
          status: SignupStatus.APPROVED,
        },
      ];

      mockSignupCollection.findAll.mockResolvedValue(mockSignups);

      const result = await service.getParticipants({
        guildId: 'test-guild',
        type: ParticipantType.Progger,
        limit: 50,
        offset: 0,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: ParticipantType.Progger,
        id: '123-DSR',
        discordId: '123',
        name: 'Test Character',
        job: Job.Paladin,
        encounter: 'DSR',
        progPoint: 'Nidhogg',
        availability: 'Weekends',
        isConfirmed: true,
      });
    });
  });

  describe('getParticipantsStream', () => {
    it('should return SSE stream that updates participants list', async () => {
      const mockStreamData = {
        type: 'added' as const,
        doc: {
          discordId: '123',
          username: 'StreamUser',
          character: 'Stream Character',
          role: 'war',
          encounter: 'DSR',
          status: SignupStatus.APPROVED,
        },
      };

      mockSignupCache.getStream.mockReturnValue(of(mockStreamData));

      const stream = service.getParticipantsStream('test-guild');

      return new Promise<void>((resolve) => {
        stream.subscribe({
          next: (event) => {
            expect(event.data.type).toBe('participants_updated');
            expect(event.data.data).toHaveLength(1);
            expect(event.data.data[0].job).toBe(Job.Warrior);
            resolve();
          },
        });
      });
    });

    it('should not remove participants when signup status changes to declined', async () => {
      const approvedData = {
        type: 'added' as const,
        doc: {
          discordId: '123',
          username: 'TestUser',
          character: 'Test Character',
          role: 'pld',
          encounter: 'DSR',
          status: SignupStatus.APPROVED,
        },
      };

      const declinedData = {
        type: 'modified' as const,
        doc: {
          discordId: '123',
          username: 'TestUser',
          character: 'Test Character',
          role: 'pld',
          encounter: 'DSR',
          status: SignupStatus.DECLINED,
        },
      };

      // First emit approved, then declined
      mockSignupCache.getStream.mockReturnValue(of(approvedData, declinedData));

      const stream = service.getParticipantsStream('test-guild');
      const events: any[] = [];

      return new Promise<void>((resolve) => {
        stream.subscribe({
          next: (event) => {
            events.push(event.data);
            if (events.length === 2) {
              // First event should add the participant
              expect(events[0].data).toHaveLength(1);
              expect(events[0].data[0].discordId).toBe('123');

              // Second event should still have the participant (not removed)
              expect(events[1].data).toHaveLength(1);
              expect(events[1].data[0].discordId).toBe('123');
              resolve();
            }
          },
        });
      });
    });
  });

  describe('mapRoleToJob', () => {
    it.each([
      { input: 'pld', expected: Job.Paladin },
      { input: 'blm', expected: Job.BlackMage },
    ])(
      'should map various job names to correct Job enum',
      ({ input, expected }) => {
        // Test the private method through public interface
        const signup = {
          discordId: '123',
          username: 'Test',
          character: 'Test',
          role: input,
          encounter: 'DSR',
          status: SignupStatus.APPROVED,
        };

        const participant = (service as any).mapSignupToParticipant(signup);
        expect(participant.job).toBe(expected);
      },
    );
  });
});
