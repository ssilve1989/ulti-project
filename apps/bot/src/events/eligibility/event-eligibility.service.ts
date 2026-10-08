import { Injectable } from '@nestjs/common';
import { type Encounter, PartyStatus } from '@ulti-project/shared';
import type { GuildMember } from 'discord.js';
import { EncountersCollection } from '../../firebase/collections/encounters-collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type { EventPhase } from '../../firebase/models/event.model.js';

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
    const mapping = settings?.progPointRoles?.[encounter] ?? {};
    const candidates: EventPhase[] = [];

    for (const [roleId, role] of member.roles.cache) {
      const points = progPoints.filter((p) => mapping[p.id] === roleId);
      if (points.length === 0) continue;
      const furthest = points.reduce((a, b) => (b.order > a.order ? b : a));
      candidates.push({
        roleId,
        label: role.name,
        order: furthest.order,
        bucket:
          furthest.partyStatus === PartyStatus.ClearParty ? 'clear' : 'prog',
      });
    }

    const clearRole = settings?.clearRoles?.[encounter];
    if (clearRole) {
      const role = member.roles.cache.get(clearRole);
      // One past the last prog point's order, so it ranks furthest
      if (role) {
        candidates.push({
          roleId: role.id,
          label: role.name,
          order: progPoints.length,
          bucket: 'clear',
        });
      }
    }

    if (candidates.length === 0) return { eligible: false };
    return {
      eligible: true,
      phase: candidates.reduce((a, b) => (b.order > a.order ? b : a)),
    };
  }
}
