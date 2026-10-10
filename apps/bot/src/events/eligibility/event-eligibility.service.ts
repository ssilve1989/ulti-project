import { Injectable } from '@nestjs/common';
import {
  type Encounter,
  type EventPhase,
  encounterPhases,
} from '@ulti-project/shared';
import type { GuildMember } from 'discord.js';
import { EncountersCollection } from '../../firebase/collections/encounters-collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';

export type Eligibility =
  | { eligible: false }
  | { eligible: true; phase: EventPhase };

@Injectable()
export class EventEligibilityService {
  constructor(
    private readonly settings: SettingsCollection,
    private readonly encounters: EncountersCollection,
  ) {}

  /** Whether `member` may sign up for `encounter`, and the furthest phase their roles give them. */
  async resolve(
    member: GuildMember,
    encounter: Encounter,
  ): Promise<Eligibility> {
    const settings = await this.settings.getSettings(member.guild.id);
    const progPoints = await this.encounters.getAllProgPoints(encounter);
    const candidates = encounterPhases(encounter, progPoints, settings).flatMap(
      (phase) => {
        const role = member.roles.cache.get(phase.roleId);
        return role ? [{ ...phase, label: role.name }] : [];
      },
    );

    if (candidates.length === 0) return { eligible: false };
    return {
      eligible: true,
      phase: candidates.reduce((a, b) => (b.order > a.order ? b : a)),
    };
  }
}
