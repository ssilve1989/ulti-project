import nock from 'nock';

const RAID_HELPER = 'https://raid-helper.xyz';

export interface RaidHelperSignUpSeed {
  userId: string;
  name: string;
  /** Raid-Helper's class: a phase like `5_` on Ulti Project's template, or Absence, Late, Bench, Tentative */
  className?: string;
  specName?: string;
  status?: string;
  /** unix seconds */
  entryTime: number;
}

/**
 * A v4 event as Raid-Helper sends it, trimmed from event 1558267863758938215
 * on Ulti Project's custom template (ct34): extra fields included, so the
 * client is seen to ignore them.
 */
export function raidHelperPayload(event: {
  id: string;
  serverId: string;
  title: string;
  startTime: number;
  closingTime?: number;
  signUps: readonly RaidHelperSignUpSeed[];
}) {
  return {
    date: '10-10-2026',
    templateId: 'ct34',
    displayTitle: event.title,
    leaderId: '168280387867377665',
    channelId: '1394782609757966376',
    ...event,
    signUps: event.signUps.map((signUp, index) => ({
      cClassName: 'Phase 5',
      className: '5_',
      specName: 'Tank',
      cSpecName: 'Tank',
      status: 'primary',
      id: 385_216_000 + index,
      position: index + 1,
      ...signUp,
    })),
  };
}

/** Raid-Helper answers `GET /api/v4/events/<id>` with `payload`, once. */
export function serveRaidHelperEvent(payload: { id: string }): nock.Scope {
  return nock(RAID_HELPER)
    .get(`/api/v4/events/${payload.id}`)
    .reply(200, payload);
}

/** Raid-Helper answers `GET /api/v4/events/<id>` with `status` and `body`, once. */
export function serveRaidHelperFailure(
  id: string,
  status: number,
  body: object = { reason: 'unknown event', status: 'failed' },
): nock.Scope {
  return nock(RAID_HELPER).get(`/api/v4/events/${id}`).reply(status, body);
}
