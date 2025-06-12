import { Injectable } from '@nestjs/common';
import { Job, ParticipantType } from '@ulti-project/shared';
import type {
  GetParticipantsQuery,
  Participant,
  ParticipantsUpdatedEvent,
} from '@ulti-project/shared/types';
import { map } from 'rxjs';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SignupDocumentCache } from '../../firebase/collections/utils/signup-document.cache.js';
import {
  type SignupDocument,
  SignupStatus,
} from '../../firebase/models/signup.model.js';

// Try exact matches first
const jobMap: Record<string, Job> = {
  // Tanks
  pld: Job.Paladin,
  war: Job.Warrior,
  drk: Job.DarkKnight,
  gnb: Job.Gunbreaker,

  // Healers
  whm: Job.WhiteMage,
  sch: Job.Scholar,
  ast: Job.Astrologian,
  sge: Job.Sage,

  // Melee DPS
  drg: Job.Dragoon,
  mnk: Job.Monk,
  nin: Job.Ninja,
  sam: Job.Samurai,
  rpr: Job.Reaper,
  vpr: Job.Viper,

  // Ranged Physical DPS
  brd: Job.Bard,
  mch: Job.Machinist,
  dnc: Job.Dancer,

  // Ranged Magical DPS
  blm: Job.BlackMage,
  smn: Job.Summoner,
  rdm: Job.RedMage,
  pct: Job.Pictomancer,
};

@Injectable()
export class ParticipantsService {
  constructor(
    private readonly signupCollection: SignupCollection,
    private readonly signupCache: SignupDocumentCache,
  ) {}

  async getParticipants(query: GetParticipantsQuery): Promise<Participant[]> {
    const { guildId, type, encounter } = query;
    const participants: Participant[] = [];

    // Get proggers (approved signups)
    if (!type || type === 'progger') {
      const signupQuery: any = {
        status: SignupStatus.APPROVED,
      };

      if (encounter) signupQuery.encounter = encounter;

      const approvedSignups = await this.signupCollection.findAll(signupQuery);

      const proggers = approvedSignups.map((signup) =>
        this.mapSignupToParticipant(signup),
      );

      participants.push(...proggers);
    }

    // Get helpers
    if (!type || type === 'helper') {
      // This would need to be implemented when HelperCollection exists
      // const helpers = await this.helperCollection.findAll({ guildId });
      // participants.push(...helpers.map(helper => this.mapHelperToParticipant(helper)));
    }

    return participants;
  }

  getParticipantsStream(guildId: string) {
    // Return SSE stream for real-time participant updates
    // This leverages the existing signup cache stream and maintains a participants list
    const allParticipants = new Map<string, Participant>();

    return this.signupCache.getStream().pipe(
      map((change) => {
        const { type, doc } = change;
        const participantId = `${doc.discordId}-${doc.encounter}`;

        // Update participants map based on change type
        if (type === 'removed' || doc.status !== SignupStatus.APPROVED) {
          allParticipants.delete(participantId);
        } else if (doc.status === SignupStatus.APPROVED) {
          allParticipants.set(participantId, this.mapSignupToParticipant(doc));
        }

        return {
          type: 'participants_updated',
          data: Array.from(allParticipants.values()),
          timestamp: new Date(),
        } as ParticipantsUpdatedEvent;
      }),
      map((event) => ({ data: event })),
    );
  }

  private mapSignupToParticipant(signup: SignupDocument): Participant {
    return {
      type: ParticipantType.Progger,
      id: `${signup.discordId}-${signup.encounter}`,
      discordId: signup.discordId,
      name: signup.username,
      characterName: signup.character,
      job: this.mapRoleToJob(signup.role),
      encounter: signup.encounter,
      progPoint: signup.progPoint || signup.progPointRequested,
      availability: signup.availability,
      isConfirmed: signup.status === SignupStatus.APPROVED,
    };
  }

  private mapRoleToJob(role: string): Job {
    // Map the freeform role string to proper Job enum
    const normalizedRole = role.toLowerCase().trim();
    return jobMap[normalizedRole];
  }
}
