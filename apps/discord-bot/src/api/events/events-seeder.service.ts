import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import {
  Encounter,
  EventStatus,
  Role,
  type ScheduledEvent,
} from '@ulti-project/shared';
import { EventsCollection } from '../../firebase/collections/events.collection.js';

@Injectable()
class EventsSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventsSeederService.name);
  private readonly TEST_GUILD_ID = '913492538516717578'; // Your test guild ID

  constructor(private readonly eventsCollection: EventsCollection) {}

  async onApplicationBootstrap() {
    this.logger.log('Seeding test events...');

    try {
      // Check if events already exist to avoid duplicates
      const existingEvents = await this.eventsCollection.getEvents(
        this.TEST_GUILD_ID,
      );

      if (existingEvents.length > 0) {
        this.logger.log(
          `Found ${existingEvents.length} existing events, skipping seed`,
        );
        return;
      }

      const testEvents = this.createTestEvents();
      this.logger.log(`Created ${testEvents.length} test events to seed`);

      for (const event of testEvents) {
        try {
          // Log the event being created for debugging
          this.logger.log(`Creating event: ${event.name} (ID: ${event.id})`);

          await this.eventsCollection.createEvent(this.TEST_GUILD_ID, event);
          this.logger.log(`✓ Created test event: ${event.name}`);
        } catch (eventError) {
          this.logger.error(eventError);
          // Continue with other events
        }
      }

      this.logger.log('Finished seeding process');
    } catch (error) {
      this.logger.error(error);
    }
  }

  private createTestEvents(): ScheduledEvent[] {
    const now = new Date();
    const baseId = Date.now();

    return [
      // FRU Events
      {
        id: `event-${baseId}-1`,
        name: 'FRU Weekly Prog - P1-P2',
        encounter: Encounter.FRU,
        scheduledTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        duration: 180, // 3 hours
        teamLeaderId: 'team-leader-1',
        teamLeaderName: 'RaidLeader',
        status: EventStatus.Published,
        roster: this.createEmptyRoster(),
        createdAt: now,
        lastModified: now,
        version: 1,
      },
      {
        id: `event-${baseId}-2`,
        name: 'FRU Clear Party - P3 Practice',
        encounter: Encounter.FRU,
        scheduledTime: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        duration: 240, // 4 hours
        teamLeaderId: 'team-leader-2',
        teamLeaderName: 'ClearMaster',
        status: EventStatus.Published,
        roster: this.createPartiallyFilledRoster(),
        createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day ago
        lastModified: now,
        version: 2,
      },
      // TOP Events
      {
        id: `event-${baseId}-3`,
        name: 'TOP Reclear - All Phases',
        encounter: Encounter.TOP,
        scheduledTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
        duration: 300, // 5 hours
        teamLeaderId: 'team-leader-1',
        teamLeaderName: 'RaidLeader',
        status: EventStatus.Published,
        roster: this.createEmptyRoster(),
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        lastModified: new Date(now.getTime() - 12 * 60 * 60 * 1000), // 12 hours ago
        version: 1,
      },
      // DSR Events
      {
        id: `event-${baseId}-4`,
        name: 'DSR Learning Party - P1-P3',
        encounter: Encounter.DSR,
        scheduledTime: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        duration: 210, // 3.5 hours
        teamLeaderId: 'team-leader-3',
        teamLeaderName: 'DragonSlayer',
        status: EventStatus.Draft,
        roster: [] as any,
        createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000), // 6 hours ago
        lastModified: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        version: 3,
      },
      // Past event (completed)
      {
        id: `event-${baseId}-5`,
        name: 'TEA Farm Session',
        encounter: Encounter.TEA,
        scheduledTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        duration: 180,
        teamLeaderId: 'team-leader-2',
        teamLeaderName: 'ClearMaster',
        status: EventStatus.Completed,
        roster: [] as any,
        createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        lastModified: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        version: 1,
      },
      // Cancelled event
      {
        id: `event-${baseId}-6`,
        name: 'UCOB Practice - Cancelled',
        encounter: Encounter.UCOB,
        scheduledTime: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
        duration: 240,
        teamLeaderId: 'team-leader-3',
        teamLeaderName: 'DragonSlayer',
        status: EventStatus.Cancelled,
        roster: [] as any,
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        lastModified: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        version: 2,
      },
    ];
  }

  private createEmptyRoster(): any {
    const slots = Array.from({ length: 8 }, (_, i) => ({
      id: `slot-${i + 1}`,
      role: i < 2 ? Role.Tank : i < 4 ? Role.Healer : Role.DPS,
      isHelperSlot: i % 2 === 0,
    }));

    return {
      party: slots,
      totalSlots: 8,
      filledSlots: 0,
    };
  }

  private createPartiallyFilledRoster() {
    const slots = Array.from({ length: 8 }, (_, i) => {
      const slot: any = {
        id: `slot-${i + 1}`,
        role: i < 2 ? Role.Tank : i < 4 ? Role.Healer : Role.DPS,
        isHelperSlot: i % 2 === 0,
      };

      // Fill first 2 slots with flattened participant data
      // if (i < 2) {
      //   slot.assignedParticipant = {
      //     type: i === 0 ? ParticipantType.Helper : ParticipantType.Progger,
      //     id: `participant-${i + 1}`,
      //     discordId: `${100000000 + i}`,
      //     name: i === 0 ? 'TankPlayer' : 'OffTank',
      //     characterName: i === 0 ? 'Tank Player' : 'Off Tank',
      //     job: i === 0 ? Job.Paladin : Job.Warrior,
      //     encounter: Encounter.FRU,
      //     isConfirmed: true,
      //   };
      // }

      return slot;
    });

    return {
      party: slots,
      totalSlots: 8,
      filledSlots: 2,
    };
  }

  private createFullRoster() {
    // Keep it simple - just create empty roster for now to avoid Firestore issues
    return this.createEmptyRoster();
  }
}

export { EventsSeederService };
