import { Injectable } from '@nestjs/common';
import type { PartyRole } from '@ulti-project/shared';
import { z } from 'zod';

const EVENTS_URL = 'https://raid-helper.xyz/api/v4/events';
const TIMEOUT_MS = 10_000;

// Ulti Project's events use its own Raid-Helper template (ct34), not the
// standard FFXIV one, and the server may change it: there `specName` is a role
// category and `className` a phase. If synced sign-ups come back "job not
// recognised", fetch a real event from the v4 API and update these tables and
// test-utils/raid-helper.ts.
const PARTY_ROLE_BY_SPEC: ReadonlyMap<string, PartyRole> = new Map([
  ['Tank', 'tank'],
  ['regenhealers', 'regen'],
  ['shieldhealers', 'shield'],
  ['Melee', 'melee'],
  ['Caster', 'caster'],
  ['Ranged', 'ranged'],
]);
const NOT_ATTENDING: ReadonlySet<string> = new Set([
  'Absence',
  'Bench',
  'Late',
  'Tentative',
  'Declined',
]);

const unixSeconds = z.number().transform((value) => new Date(value * 1000));

const eventSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  title: z.string(),
  startTime: unixSeconds,
  closingTime: unixSeconds.nullish(),
  signUps: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      className: z.string(),
      specName: z.string().nullish(),
      status: z.string(),
      entryTime: unixSeconds,
    }),
  ),
});

export interface RaidHelperSignUp {
  /** Raid-Helper's user id: a Discord id, or a made-up name for an added guest */
  discordId: string;
  name: string;
  attending: boolean;
  /** undefined when the template's spec isn't one we know */
  role: PartyRole | undefined;
  signedUpAt: Date;
}

export interface RaidHelperEvent {
  id: string;
  serverId: string;
  title: string;
  startsAt: Date;
  closesAt: Date | undefined;
  signUps: RaidHelperSignUp[];
}

@Injectable()
export class RaidHelperClient {
  /** The event, or undefined when Raid-Helper doesn't know it. Any other failure throws. */
  async getEvent(id: string): Promise<RaidHelperEvent | undefined> {
    const response = await fetch(`${EVENTS_URL}/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new Error(
        `Raid-Helper answered ${response.status} for event ${id}`,
      );
    }
    const event = eventSchema.parse(await response.json());
    return {
      id: event.id,
      serverId: event.serverId,
      title: event.title,
      startsAt: event.startTime,
      closesAt: event.closingTime ?? undefined,
      signUps: event.signUps.map((signUp) => ({
        discordId: signUp.userId,
        name: signUp.name,
        attending:
          signUp.status === 'primary' && !NOT_ATTENDING.has(signUp.className),
        role: signUp.specName
          ? PARTY_ROLE_BY_SPEC.get(signUp.specName)
          : undefined,
        signedUpAt: signUp.entryTime,
      })),
    };
  }
}
