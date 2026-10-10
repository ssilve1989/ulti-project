import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type Encounter,
  type PartyRole,
  participantDocId,
  SignupStatus,
} from '@ulti-project/shared';
import type { GuildMember } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { DiscordService } from '../../discord/discord.service.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type {
  NewParticipant,
  ParticipantDocument,
  StoredEvent,
} from '../../firebase/models/event.model.js';
import type {
  RaidHelperEvent,
  RaidHelperSignUp,
} from '../../raid-helper/raid-helper.client.js';
import { EventEligibilityService } from '../eligibility/event-eligibility.service.js';
import { EventChangesBus } from '../event-changes.bus.js';
import { EventMessageService } from '../event-message.service.js';
import { ParticipantRemovalService } from '../signup/participant-removal.service.js';

export type SkipReason =
  | 'not attending'
  | 'job not recognised'
  | 'not in the server'
  | 'no reviewed sign-up'
  | 'no prog-point role';

export interface SyncReport {
  added: number;
  updated: number;
  removed: number;
  skipped: { name: string; reason: SkipReason }[];
}

// Raid-Helper also lists guests by a made-up name; Discord can't fetch those
const SNOWFLAKE = /^\d{17,20}$/;

/**
 * Reports `signUp` as skipped. A member whose job isn't recognised keeps their
 * participants from an earlier sync, so a template change can't wipe them.
 */
function skip(
  report: SyncReport,
  { name, discordId }: RaidHelperSignUp,
  reason: SkipReason,
  before: ReadonlyMap<string, ParticipantDocument>,
  kept: Set<string>,
): void {
  report.skipped.push({ name, reason });
  if (reason !== 'job not recognised') return;
  for (const [id, participant] of before) {
    if (participant.discordId === discordId) kept.add(id);
  }
}

@Injectable()
export class RaidHelperSyncService {
  constructor(
    private readonly events: EventsCollection,
    private readonly signups: SignupCollection,
    private readonly eligibility: EventEligibilityService,
    private readonly discord: DiscordService,
    private readonly changes: EventChangesBus,
    private readonly eventMessages: EventMessageService,
    private readonly removal: ParticipantRemovalService,
  ) {}

  /**
   * Makes `event`'s synced participants match `source`'s sign-ups: adds and
   * updates the ones it can match, removes the rest. Button sign-ups are left
   * alone, and so is an attending member whose job it doesn't recognise.
   */
  @SentryTraced()
  async sync(event: StoredEvent, source: RaidHelperEvent): Promise<SyncReport> {
    const before = new Map(
      (await this.events.listParticipants(event.id)).map((participant) => [
        participantDocId(participant.discordId, participant.encounter),
        participant,
      ]),
    );
    const members = await this.discord.getGuildMembers({
      guildId: event.guildId,
      memberIds: source.signUps
        .filter(
          ({ attending, role, discordId }) =>
            attending && role && SNOWFLAKE.test(discordId),
        )
        .map(({ discordId }) => discordId),
    });

    const report: SyncReport = {
      added: 0,
      updated: 0,
      removed: 0,
      skipped: [],
    };
    const kept = new Set<string>();
    for (const signUp of source.signUps) {
      const matched = await this.match(
        signUp,
        members.get(signUp.discordId),
        event.encounters,
      );
      if (typeof matched === 'string') {
        skip(report, signUp, matched, before, kept);
        continue;
      }
      for (const participant of matched) {
        const id = participantDocId(
          participant.discordId,
          participant.encounter,
        );
        const existing = before.get(id);
        // a member's own sign-up with the button wins over Raid-Helper's
        if (existing && existing.source !== 'raid-helper') continue;
        const written = await this.events.upsertParticipant(
          event.id,
          participant,
        );
        kept.add(id);
        if (existing) report.updated += 1;
        else report.added += 1;
        if (written) {
          this.changes.publish({
            kind: 'participant',
            eventId: event.id,
            participantId: id,
          });
        }
      }
    }

    report.removed = await this.removeUnkept(event.id, before, kept);
    await this.eventMessages.refresh(event.id);
    return report;
  }

  /** `signUp`'s participants, or why it has none. */
  private match(
    { attending, role, signedUpAt }: RaidHelperSignUp,
    member: GuildMember | undefined,
    encounters: readonly Encounter[],
  ): Promise<NewParticipant[] | SkipReason> | SkipReason {
    if (!attending) return 'not attending';
    if (role === undefined) return 'job not recognised';
    if (!member) return 'not in the server';
    return this.participantsFor(member, encounters, role, signedUpAt);
  }

  /** The member's participants for the encounters they can join, or why there are none. */
  private async participantsFor(
    member: GuildMember,
    encounters: readonly Encounter[],
    role: PartyRole,
    signedUpAt: Date,
  ): Promise<NewParticipant[] | SkipReason> {
    const participants: NewParticipant[] = [];
    let reviewed = false;
    const signups = await Promise.all(
      encounters.map(async (encounter) => ({
        encounter,
        signup: await this.signups.findById(
          SignupCollection.getKeyForSignup({ discordId: member.id, encounter }),
        ),
      })),
    );
    for (const { encounter, signup } of signups) {
      if (
        signup?.status !== SignupStatus.APPROVED &&
        signup?.status !== SignupStatus.UPDATE_PENDING
      ) {
        continue;
      }
      reviewed = true;
      const eligibility = await this.eligibility.resolve(member, encounter);
      if (!eligibility.eligible) continue;
      participants.push({
        discordId: member.id,
        encounter,
        role,
        source: 'raid-helper',
        character: signup.character,
        world: signup.world,
        phase: eligibility.phase,
        signedUpAt: Timestamp.fromDate(signedUpAt),
      });
    }
    if (participants.length > 0) return participants;
    return reviewed ? 'no prog-point role' : 'no reviewed sign-up';
  }

  /** Removes the synced participants in `before` that this sync didn't keep; how many it removed. */
  private async removeUnkept(
    eventId: string,
    before: ReadonlyMap<string, ParticipantDocument>,
    kept: ReadonlySet<string>,
  ): Promise<number> {
    let removed = 0;
    for (const [id, participant] of before) {
      if (participant.source !== 'raid-helper' || kept.has(id)) continue;
      if (await this.removal.remove(eventId, id, 'left-raid-helper')) {
        removed += 1;
      }
    }
    return removed;
  }
}
