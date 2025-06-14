import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import {
  Encounter,
  EventStatus,
  Job,
  ParticipantType,
  PartyStatus,
  Role,
  type ScheduledEvent,
} from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { DraftLocksCollection } from '../firebase/collections/draft-locks.collection.js';
import { EventsCollection } from '../firebase/collections/events.collection.js';
import { HelperAbsenceCollection } from '../firebase/collections/helper-absence.collection.js';
import { HelperCollection } from '../firebase/collections/helper.collection.js';
import { SignupCollection } from '../firebase/collections/signup.collection.js';
import type {
  HelperAbsenceDocument,
  HelperDocument,
} from '../firebase/models/helper.model.js';
import {
  type SignupDocument,
  SignupStatus,
} from '../firebase/models/signup.model.js';

@Injectable()
export class DatabaseSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSeederService.name);
  private readonly TEST_GUILD_ID = '913492538516717578'; // Your test guild ID

  constructor(
    private readonly eventsCollection: EventsCollection,
    private readonly helperCollection: HelperCollection,
    private readonly helperAbsenceCollection: HelperAbsenceCollection,
    private readonly signupCollection: SignupCollection,
    private readonly draftLocksCollection: DraftLocksCollection,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('🌱 Starting database seeding...');

    try {
      // Check if data already exists to avoid duplicates
      const existingEvents = await this.eventsCollection.getEvents(
        this.TEST_GUILD_ID,
      );
      const existingHelpers = await this.helperCollection.getHelpers(
        this.TEST_GUILD_ID,
      );

      if (existingEvents.length > 0 || existingHelpers.length > 0) {
        this.logger.log(
          `Found ${existingEvents.length} events and ${existingHelpers.length} helpers, skipping seed`,
        );
        return;
      }

      // Seed data in order (helpers first, then proggers, then events, then locks)
      await this.seedHelpers();
      await this.seedProggers();
      await this.seedEvents();
      // Skip locks for now - they'll be created dynamically during testing

      this.logger.log('✅ Database seeding completed successfully!');
    } catch (error) {
      this.logger.error('❌ Database seeding failed:', error);
      throw error;
    }
  }

  private async seedHelpers(): Promise<void> {
    this.logger.log('🔧 Seeding helpers...');

    const helpers: HelperDocument[] = [
      {
        id: 'helper-1',
        discordId: '100000000001',
        name: 'TankMaster',
        availableJobs: [
          { job: Job.Paladin, role: Role.Tank, isPreferred: true },
          { job: Job.Warrior, role: Role.Tank },
          { job: Job.DarkKnight, role: Role.Tank },
          { job: Job.Gunbreaker, role: Role.Tank },
        ],
        weeklyAvailability: [
          {
            dayOfWeek: 1, // Monday
            timeRanges: [
              { start: '19:00', end: '23:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 2, // Tuesday
            timeRanges: [
              { start: '19:00', end: '23:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 5, // Friday
            timeRanges: [
              { start: '20:00', end: '24:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 6, // Saturday
            timeRanges: [
              { start: '14:00', end: '20:00', timezone: 'America/New_York' },
            ],
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'helper-2',
        discordId: '100000000002',
        name: 'HealBot',
        availableJobs: [
          { job: Job.WhiteMage, role: Role.Healer, isPreferred: true },
          { job: Job.Scholar, role: Role.Healer },
          { job: Job.Astrologian, role: Role.Healer },
          { job: Job.Sage, role: Role.Healer },
        ],
        weeklyAvailability: [
          {
            dayOfWeek: 2, // Tuesday
            timeRanges: [
              { start: '18:00', end: '22:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 3, // Wednesday
            timeRanges: [
              { start: '18:00', end: '22:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 4, // Thursday
            timeRanges: [
              { start: '18:00', end: '22:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 0, // Sunday
            timeRanges: [
              { start: '15:00', end: '21:00', timezone: 'America/New_York' },
            ],
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'helper-3',
        discordId: '100000000003',
        name: 'DPSGod',
        availableJobs: [
          { job: Job.BlackMage, role: Role.DPS, isPreferred: true },
          { job: Job.Summoner, role: Role.DPS },
          { job: Job.RedMage, role: Role.DPS },
          { job: Job.Dragoon, role: Role.DPS },
          { job: Job.Ninja, role: Role.DPS },
        ],
        weeklyAvailability: [
          {
            dayOfWeek: 1, // Monday
            timeRanges: [
              { start: '20:00', end: '24:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 3, // Wednesday
            timeRanges: [
              { start: '20:00', end: '24:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 5, // Friday
            timeRanges: [
              { start: '19:00', end: '23:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 6, // Saturday
            timeRanges: [
              { start: '16:00', end: '22:00', timezone: 'America/New_York' },
            ],
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'helper-4',
        discordId: '100000000004',
        name: 'FlexPlayer',
        availableJobs: [
          { job: Job.Gunbreaker, role: Role.Tank },
          { job: Job.Sage, role: Role.Healer, isPreferred: true },
          { job: Job.Reaper, role: Role.DPS },
          { job: Job.Dancer, role: Role.DPS },
        ],
        weeklyAvailability: [
          {
            dayOfWeek: 2, // Tuesday
            timeRanges: [
              { start: '19:30', end: '23:30', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 4, // Thursday
            timeRanges: [
              { start: '19:30', end: '23:30', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 0, // Sunday
            timeRanges: [
              { start: '13:00', end: '18:00', timezone: 'America/New_York' },
            ],
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'helper-5',
        discordId: '100000000005',
        name: 'RangedExpert',
        availableJobs: [
          { job: Job.Bard, role: Role.DPS, isPreferred: true },
          { job: Job.Machinist, role: Role.DPS },
          { job: Job.Dancer, role: Role.DPS },
        ],
        weeklyAvailability: [
          {
            dayOfWeek: 1, // Monday
            timeRanges: [
              { start: '18:00', end: '22:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 3, // Wednesday
            timeRanges: [
              { start: '18:00', end: '22:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 5, // Friday
            timeRanges: [
              { start: '18:00', end: '22:00', timezone: 'America/New_York' },
            ],
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'helper-6',
        discordId: '100000000006',
        name: 'MeleeMain',
        availableJobs: [
          { job: Job.Monk, role: Role.DPS },
          { job: Job.Dragoon, role: Role.DPS, isPreferred: true },
          { job: Job.Ninja, role: Role.DPS },
          { job: Job.Samurai, role: Role.DPS },
          { job: Job.Reaper, role: Role.DPS },
        ],
        weeklyAvailability: [
          {
            dayOfWeek: 2, // Tuesday
            timeRanges: [
              { start: '20:00', end: '24:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 4, // Thursday
            timeRanges: [
              { start: '20:00', end: '24:00', timezone: 'America/New_York' },
            ],
          },
          {
            dayOfWeek: 6, // Saturday
            timeRanges: [
              { start: '15:00', end: '21:00', timezone: 'America/New_York' },
            ],
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    for (const helper of helpers) {
      try {
        await this.helperCollection.upsertHelper(this.TEST_GUILD_ID, helper);
        this.logger.log(`✓ Created helper: ${helper.name}`);
      } catch (error) {
        this.logger.error(`Failed to create helper ${helper.name}:`, error);
      }
    }

    // Seed some helper absences
    await this.seedHelperAbsences();
  }

  private async seedHelperAbsences(): Promise<void> {
    this.logger.log('🚫 Seeding helper absences...');

    const absences: Array<{
      helperId: string;
      absence: Omit<HelperAbsenceDocument, 'id' | 'helperId' | 'createdAt'>;
    }> = [
      {
        helperId: 'helper-1',
        absence: {
          startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks from now
          endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 3 weeks from now
          reason: 'Vacation - Going to Japan',
        },
      },
      {
        helperId: 'helper-3',
        absence: {
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
          endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
          reason: 'Work conference',
        },
      },
    ];

    for (const { helperId, absence } of absences) {
      try {
        await this.helperAbsenceCollection.createAbsence(
          this.TEST_GUILD_ID,
          helperId,
          absence,
        );
        this.logger.log(`✓ Created absence for helper: ${helperId}`);
      } catch (error) {
        this.logger.error(`Failed to create absence for ${helperId}:`, error);
      }
    }
  }

  private async seedProggers(): Promise<void> {
    this.logger.log('🎮 Seeding proggers (signups)...');

    const now = new Date();
    const expiresAt = Timestamp.fromDate(
      new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000), // 28 days from now
    );

    const proggers: SignupDocument[] = [
      {
        availability: 'Mon-Wed 7-11pm EST, weekends flexible',
        character: 'Katelyn Arashi',
        discordId: '200000000001',
        encounter: Encounter.FRU,
        role: 'Paladin',
        progPoint: 'P2 Light Rampant',
        progPointRequested: 'P2 Light Rampant',
        partyStatus: PartyStatus.ProgParty,
        reviewedBy: 'moderator-1',
        screenshot: null,
        username: 'KatelynFF',
        status: SignupStatus.APPROVED,
        world: 'Gilgamesh',
        expiresAt,
        notes: 'Have cleared P1 consistently, working on Light Rampant strats',
        proofOfProgLink: 'https://fflogs.com/example-log-1',
      },
      {
        availability: 'Tue/Thu/Sat 8pm-12am EST',
        character: 'Lightning Strike',
        discordId: '200000000002',
        encounter: Encounter.FRU,
        role: 'Black Mage',
        progPoint: 'P3 Transitions',
        progPointRequested: 'P3 Transitions',
        partyStatus: PartyStatus.ProgParty,
        reviewedBy: 'moderator-1',
        screenshot: null,
        username: 'ThunderMage',
        status: SignupStatus.APPROVED,
        world: 'Leviathan',
        expiresAt,
        notes: 'Comfortable with P1-P2, learning P3 rotations',
        proofOfProgLink: 'https://fflogs.com/example-log-2',
      },
      {
        availability: 'Flexible weekdays after 6pm PST',
        character: 'Sword Saint',
        discordId: '200000000003',
        encounter: Encounter.FRU,
        role: 'Warrior',
        progPoint: 'P2 Light Rampant',
        progPointRequested: 'P2 Light Rampant',
        partyStatus: PartyStatus.ProgParty,
        reviewedBy: 'moderator-1',
        screenshot: null,
        username: 'WarriorOfLight',
        status: SignupStatus.APPROVED,
        world: 'Behemoth',
        expiresAt,
        notes: 'Experienced tank, can do both MT and OT',
        proofOfProgLink: 'https://fflogs.com/example-log-3',
      },
      {
        availability: 'Weekend warrior - Sat/Sun anytime',
        character: 'Divine Healer',
        discordId: '200000000004',
        encounter: Encounter.FRU,
        role: 'White Mage',
        progPoint: 'P1 Burnished Glory',
        progPointRequested: 'P1 Clear',
        partyStatus: PartyStatus.EarlyProgParty,
        reviewedBy: 'moderator-2',
        screenshot: null,
        username: 'HolyPriest',
        status: SignupStatus.APPROVED,
        world: 'Excalibur',
        expiresAt,
        notes: 'New to FRU but experienced with other Ultimates',
        proofOfProgLink: null,
      },
      {
        availability: 'Mon/Wed/Fri 9pm-1am EST',
        character: 'Shadow Blade',
        discordId: '200000000005',
        encounter: Encounter.TOP,
        role: 'Ninja',
        progPoint: 'P3 Hello World',
        progPointRequested: 'P3 Hello World',
        partyStatus: PartyStatus.ProgParty,
        reviewedBy: 'moderator-1',
        screenshot: null,
        username: 'NinjaMaster',
        status: SignupStatus.APPROVED,
        world: 'Hyperion',
        expiresAt,
        notes: 'Have TOP clear, helping with prog parties',
        proofOfProgLink: 'https://fflogs.com/example-log-4',
      },
      {
        availability: 'Daily 7-10pm EST except weekends',
        character: 'Ranged Slayer',
        discordId: '200000000006',
        encounter: Encounter.TOP,
        role: 'Bard',
        progPoint: 'P2 Pantokrator',
        progPointRequested: 'P2 Pantokrator',
        partyStatus: PartyStatus.ProgParty,
        reviewedBy: 'moderator-2',
        screenshot: null,
        username: 'BardSong',
        status: SignupStatus.APPROVED,
        world: 'Lamia',
        expiresAt,
        notes: 'Good at priority systems and mechanics',
        proofOfProgLink: 'https://fflogs.com/example-log-5',
      },
      {
        availability: 'Very flexible schedule',
        character: 'Dark Destroyer',
        discordId: '200000000007',
        encounter: Encounter.DSR,
        role: 'Dark Knight',
        progPoint: 'P5 Death of the Heavens',
        progPointRequested: 'P5 Death of the Heavens',
        partyStatus: PartyStatus.ProgParty,
        reviewedBy: 'moderator-1',
        screenshot: null,
        username: 'DarkTank',
        status: SignupStatus.APPROVED,
        world: 'Midgardsormr',
        expiresAt,
        notes: 'Experienced with DSR mechanics, reliable tank',
        proofOfProgLink: 'https://fflogs.com/example-log-6',
      },
      {
        availability: 'Weekends only, can do long sessions',
        character: 'Astro Guide',
        discordId: '200000000008',
        encounter: Encounter.DSR,
        role: 'Astrologian',
        progPoint: 'P3 Nidhogg',
        progPointRequested: 'P3 Nidhogg',
        partyStatus: PartyStatus.ProgParty,
        reviewedBy: 'moderator-2',
        screenshot: null,
        username: 'StarReader',
        status: SignupStatus.APPROVED,
        world: 'Famfrit',
        expiresAt,
        notes: 'Good at callouts, card optimization specialist',
        proofOfProgLink: 'https://fflogs.com/example-log-7',
      },
      {
        availability: 'Tuesday/Thursday/Sunday 8-11pm EST',
        character: 'Spell Weaver',
        discordId: '200000000009',
        encounter: Encounter.TEA,
        role: 'Red Mage',
        progPoint: 'Perfect Alexander',
        progPointRequested: 'Perfect Alexander',
        partyStatus: PartyStatus.Cleared,
        reviewedBy: 'moderator-1',
        screenshot: null,
        username: 'RedMageProud',
        status: SignupStatus.APPROVED,
        world: 'Sargatanas',
        expiresAt,
        notes: 'TEA clear, can help with farms and prog',
        proofOfProgLink: 'https://fflogs.com/example-log-8',
      },
      {
        availability: 'Monday-Thursday 6-10pm PST',
        character: 'Earth Shaker',
        discordId: '200000000010',
        encounter: Encounter.UCOB,
        role: 'Monk',
        progPoint: 'Golden Bahamut',
        progPointRequested: 'Golden Bahamut',
        partyStatus: PartyStatus.Cleared,
        reviewedBy: 'moderator-2',
        screenshot: null,
        username: 'MonkFist',
        status: SignupStatus.APPROVED,
        world: 'Cactuar',
        expiresAt,
        notes: 'UCOB cleared multiple times, happy to help others',
        proofOfProgLink: 'https://fflogs.com/example-log-9',
      },
    ];

    for (const progger of proggers) {
      try {
        await this.signupCollection.upsert(progger);
        this.logger.log(
          `✓ Created progger: ${progger.username} (${progger.encounter})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to create progger ${progger.username}:`,
          error,
        );
      }
    }
  }

  private async seedEvents(): Promise<void> {
    this.logger.log('📅 Seeding events...');

    const now = new Date();
    const baseId = Date.now();

    const events: ScheduledEvent[] = [
      // FRU Events
      {
        id: `event-${baseId}-1`,
        name: 'FRU Weekly Prog - P2 Light Rampant Practice',
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
        name: 'FRU Clear Party - P3 Diamond Dust',
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
      {
        id: `event-${baseId}-3`,
        name: 'FRU Learning Party - P1 Burnished Glory',
        encounter: Encounter.FRU,
        scheduledTime: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
        duration: 150, // 2.5 hours
        teamLeaderId: 'team-leader-3',
        teamLeaderName: 'NewbieHelper',
        status: EventStatus.Draft,
        roster: this.createEmptyRoster(),
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
        lastModified: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        version: 1,
      },
      // TOP Events
      {
        id: `event-${baseId}-4`,
        name: 'TOP Reclear - All Phases Review',
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
      {
        id: `event-${baseId}-5`,
        name: 'TOP P3 Hello World Practice',
        encounter: Encounter.TOP,
        scheduledTime: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000), // 4 days from now
        duration: 210, // 3.5 hours
        teamLeaderId: 'team-leader-4',
        teamLeaderName: 'HelloWorldMaster',
        status: EventStatus.Published,
        roster: this.createEmptyRoster(),
        createdAt: new Date(now.getTime() - 18 * 60 * 60 * 1000), // 18 hours ago
        lastModified: new Date(now.getTime() - 6 * 60 * 60 * 1000), // 6 hours ago
        version: 1,
      },
      // DSR Events
      {
        id: `event-${baseId}-6`,
        name: 'DSR Learning Party - P1-P3 Overview',
        encounter: Encounter.DSR,
        scheduledTime: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        duration: 210, // 3.5 hours
        teamLeaderId: 'team-leader-3',
        teamLeaderName: 'DragonSlayer',
        status: EventStatus.Draft,
        roster: this.createEmptyRoster(),
        createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000), // 6 hours ago
        lastModified: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        version: 3,
      },
      // Past event (completed)
      {
        id: `event-${baseId}-7`,
        name: 'TEA Farm Session - Weekly Clear',
        encounter: Encounter.TEA,
        scheduledTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        duration: 180,
        teamLeaderId: 'team-leader-2',
        teamLeaderName: 'ClearMaster',
        status: EventStatus.Completed,
        roster: this.createFullyFilledRoster(),
        createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        lastModified: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        version: 1,
      },
      // Cancelled event
      {
        id: `event-${baseId}-8`,
        name: 'UCOB Practice - Cancelled Due to Patch',
        encounter: Encounter.UCOB,
        scheduledTime: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
        duration: 240,
        teamLeaderId: 'team-leader-3',
        teamLeaderName: 'DragonSlayer',
        status: EventStatus.Cancelled,
        roster: this.createEmptyRoster(),
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        lastModified: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        version: 2,
      },
      // In-progress event
      {
        id: `event-${baseId}-9`,
        name: 'FRU Marathon Session - Currently Live!',
        encounter: Encounter.FRU,
        scheduledTime: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        duration: 360, // 6 hours
        teamLeaderId: 'team-leader-1',
        teamLeaderName: 'RaidLeader',
        status: EventStatus.InProgress,
        roster: this.createFullyFilledRoster(),
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        lastModified: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        version: 4,
      },
    ];

    for (const event of events) {
      try {
        await this.eventsCollection.createEvent(this.TEST_GUILD_ID, event);
        this.logger.log(`✓ Created event: ${event.name} (${event.status})`);
      } catch (error) {
        this.logger.error(`Failed to create event ${event.name}:`, error);
      }
    }
  }

  private createEmptyRoster(): any {
    const slots = Array.from({ length: 8 }, (_, i) => ({
      id: `slot-${i + 1}`,
      role: i < 2 ? Role.Tank : i < 4 ? Role.Healer : Role.DPS,
      isHelperSlot: i % 2 === 0,
      assignedParticipant: null,
    }));

    return {
      party: slots,
      totalSlots: 8,
      filledSlots: 0,
    };
  }

  private createPartiallyFilledRoster(): any {
    const slots = Array.from({ length: 8 }, (_, i) => {
      const slot: any = {
        id: `slot-${i + 1}`,
        role: i < 2 ? Role.Tank : i < 4 ? Role.Healer : Role.DPS,
        isHelperSlot: i % 2 === 0,
        assignedParticipant: null,
      };

      // Fill first 3 slots with sample participants
      if (i < 3) {
        slot.assignedParticipant = {
          type: i === 0 ? ParticipantType.Helper : ParticipantType.Progger,
          id: i === 0 ? 'helper-1' : `progger-${i}`,
          discordId: `${100000000 + i}`,
          name: i === 0 ? 'TankMaster' : i === 1 ? 'KatelynFF' : 'ThunderMage',
          job: i === 0 ? Job.Paladin : i === 1 ? Job.Paladin : Job.BlackMage,
          encounter: Encounter.FRU,
          isConfirmed: true,
        };
      }

      return slot;
    });

    return {
      party: slots,
      totalSlots: 8,
      filledSlots: 3,
    };
  }

  private createFullyFilledRoster(): any {
    const slots = Array.from({ length: 8 }, (_, i) => {
      const jobs = [
        Job.Paladin, // Tank 1
        Job.Warrior, // Tank 2
        Job.WhiteMage, // Healer 1
        Job.Scholar, // Healer 2
        Job.BlackMage, // DPS 1
        Job.Dragoon, // DPS 2
        Job.Bard, // DPS 3
        Job.Ninja, // DPS 4
      ];

      const names = [
        'TankMaster',
        'WarriorOfLight',
        'HealBot',
        'HolyPriest',
        'DPSGod',
        'MeleeMain',
        'RangedExpert',
        'NinjaMaster',
      ];

      return {
        id: `slot-${i + 1}`,
        role: i < 2 ? Role.Tank : i < 4 ? Role.Healer : Role.DPS,
        isHelperSlot: i % 2 === 0,
        assignedParticipant: {
          type: i % 2 === 0 ? ParticipantType.Helper : ParticipantType.Progger,
          id: i % 2 === 0 ? `helper-${Math.floor(i / 2) + 1}` : `progger-${i}`,
          discordId: `${100000000 + i + 1}`,
          name: names[i],
          job: jobs[i],
          encounter: Encounter.TEA,
          isConfirmed: true,
        },
      };
    });

    return {
      party: slots,
      totalSlots: 8,
      filledSlots: 8,
    };
  }
}
