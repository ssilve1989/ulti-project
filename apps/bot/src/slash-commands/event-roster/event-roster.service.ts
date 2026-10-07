import { Injectable } from '@nestjs/common';
import { type Encounter, SignupStatus } from '@ulti-project/shared';
import { EncountersService } from '../../encounters/encounters.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { RaidHelperService } from '../../raid-helper/raid-helper.service.js';
import type { RosterGroup, RosterRow } from './event-roster.table.js';

type EventRoster =
  | { kind: 'not-found' }
  | { kind: 'empty' }
  | { kind: 'roster'; title: string; groups: RosterGroup[] };

/** Signups whose prog point a coordinator has confirmed */
const COUNTED_STATUSES: ReadonlySet<SignupStatus> = new Set([
  SignupStatus.APPROVED,
  SignupStatus.UPDATE_PENDING,
]);
/** The class raid-helper gives members who signed up as absent */
const ABSENCE = 'Absence';

@Injectable()
class EventRosterService {
  constructor(
    private readonly raidHelperService: RaidHelperService,
    private readonly signupCollection: SignupCollection,
    private readonly encountersService: EncountersService,
  ) {}

  async getRoster(eventId: string, encounter: Encounter): Promise<EventRoster> {
    const event = await this.raidHelperService.getEvent(eventId);
    if (!event) return { kind: 'not-found' };

    const signUps = event.signUps
      .filter(({ className }) => className !== ABSENCE)
      .toSorted((a, b) => a.position - b.position);
    if (signUps.length === 0) return { kind: 'empty' };

    const [signups, progPoints] = await Promise.all([
      this.signupCollection.findByDiscordIdsIn(
        encounter,
        signUps.map(({ userId }) => userId),
      ),
      this.encountersService.getAllProgPoints(encounter),
    ]);
    const counted = new Map(
      signups
        .filter(({ status }) => COUNTED_STATUSES.has(status))
        .map((signup) => [signup.discordId, signup]),
    );

    const atProgPoint = new Map<string, RosterRow[]>(
      progPoints.map(({ id }) => [id, []]),
    );
    const noProgPoint: RosterRow[] = [];
    const noSignup: RosterRow[] = [];

    for (const { userId, name, className, specName } of signUps) {
      const job = specName ?? className;
      const signup = counted.get(userId);
      if (!signup) {
        noSignup.push({ name, world: '-', job });
        continue;
      }
      const row = { name: signup.character, world: signup.world, job };
      const rows =
        signup.progPoint === undefined
          ? undefined
          : atProgPoint.get(signup.progPoint);
      (rows ?? noProgPoint).push(row);
    }

    const groups = [
      ...progPoints
        .toSorted((a, b) => b.order - a.order)
        .map(({ id, label }) => ({ label, rows: atProgPoint.get(id) ?? [] })),
      { label: 'Approved, no prog point', rows: noProgPoint },
      { label: 'No signup / not approved', rows: noSignup },
    ].filter(({ rows }) => rows.length > 0);

    return { kind: 'roster', title: event.title, groups };
  }
}

export { EventRosterService };
