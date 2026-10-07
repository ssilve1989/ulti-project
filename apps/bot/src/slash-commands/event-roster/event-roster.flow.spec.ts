import {
  Encounter,
  EncounterFriendlyDescription,
  PartyStatus,
  SignupStatus,
} from '@ulti-project/shared';
import { PermissionFlagsBits } from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import type { FakeSignUp } from '../../test-utils/raid-helper/raid-helper-mock.js';
import {
  commandErrorReply,
  expectCommandErrorReported,
  privateReply,
} from '../../test-utils/replies.js';
import { type SeedOverrides, seedSignup } from '../../test-utils/signups.js';
import {
  type RosterFormat,
  type RosterGroup,
  type RosterRow,
  rosterMessages,
} from './event-roster.embeds.js';

const GUILD = 'guild-1';
const EVENT_ID = '1555738372373356595';
const TITLE = 'Dancing Mad Reclear';
const ADMIN = Object.freeze({
  id: 'admin-1',
  username: 'admin',
  permissions: PermissionFlagsBits.Administrator,
});

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      const flow = await createFlowApp();
      flow.discord.addChannel(GUILD, 'general');
      flow.discord.addMember(ADMIN);
      seedProgPoints(flow);
      return flow;
    },
    (flow) => flow.close(),
  ),
});

function seedProgPoints(flow: FlowApp): void {
  const progPoint = (id: string, label: string, order: number) =>
    flow.db.seed(`encounters/${Encounter.DMU}/prog-points/${id}`, {
      id,
      label,
      partyStatus: PartyStatus.ProgParty,
      order,
      active: true,
    });
  progPoint('P1 Opener', 'Phase 1: Opener', 0);
  progPoint('P2 Mid', 'Phase 2: Mid', 1);
  progPoint('P3 Enrage', 'Phase 3: Enrage', 2);
}

/** A DMU signup for `discordId` (pending unless `changes` says otherwise), as the signup flow stores it. */
const signup = (flow: FlowApp, discordId: string, changes: SeedOverrides) =>
  seedSignup(flow, {
    discordId,
    encounter: Encounter.DMU,
    character: `${discordId} character`,
    world: 'jenova',
    ...changes,
  });

/** An approved DMU signup, confirmed at `progPoint` (none when left out, as Firestore never stores undefined). */
const approvedAt = (flow: FlowApp, discordId: string, progPoint?: string) =>
  signup(flow, discordId, {
    status: SignupStatus.APPROVED,
    ...(progPoint === undefined ? {} : { progPoint }),
  });

/** Runs /event-roster as the admin and returns every reply they got. */
async function roster(
  flow: FlowApp,
  { event = EVENT_ID, format }: { event?: string; format?: RosterFormat } = {},
) {
  flow.discord.command({
    userId: ADMIN.id,
    guildId: GUILD,
    commandName: 'event-roster',
    options: {
      event,
      encounter: Encounter.DMU,
      ...(format === undefined ? {} : { format }),
    },
  });
  await flow.settle();
  return flow.discord.repliesTo(ADMIN.id).map(shown);
}

/** The private replies listing `groups`, as the roster's messages. */
const rosterReplies = (groups: RosterGroup[], format: RosterFormat = 'table') =>
  rosterMessages({
    title: TITLE,
    description: EncounterFriendlyDescription[Encounter.DMU],
    groups,
    format,
  }).map(({ content, embeds }) => privateReply(ADMIN.id, { content, embeds }));

const signUp = (
  userId: string,
  specName: string,
  className = 'Tank',
): FakeSignUp => ({ userId, name: `${userId} rh`, className, specName });

/** The roster row of a member without a counted signup, from their raid-helper sign-up */
const uncounted = ({
  userId,
  name,
  className,
  specName,
}: FakeSignUp): RosterRow => ({
  discordId: userId,
  raidHelperName: name,
  className,
  specName,
});

/** The roster row of a member whose counted signup is the one `signup()` seeds */
const counted = (signUp: FakeSignUp): RosterRow => ({
  ...uncounted(signUp),
  character: { name: `${signUp.userId} character`, world: 'jenova' },
});

describe('Event roster', () => {
  describe('when signed-up players have signups at different prog points', () => {
    it('groups them by prog point, furthest first, in sign-up order, with their character, world and job', async ({
      flow,
    }) => {
      approvedAt(flow, 'mid-2', 'P2 Mid');
      approvedAt(flow, 'enrage', 'P3 Enrage');
      approvedAt(flow, 'mid-1', 'P2 Mid');
      const mid2 = { ...signUp('mid-2', 'Darkknight'), position: 3 };
      const enrage = {
        ...signUp('enrage', 'Whitemage', 'Healer'),
        position: 1,
      };
      const mid1 = {
        userId: 'mid-1',
        name: 'mid-1 rh',
        className: 'Allrounder',
        position: 2,
      };
      flow.raidHelper.addEvent(EVENT_ID, {
        title: TITLE,
        signUps: [mid2, enrage, mid1],
      });

      await expect(roster(flow)).resolves.toEqual(
        rosterReplies([
          {
            label: 'Phase 3: Enrage',
            rows: [counted(enrage)],
          },
          {
            label: 'Phase 2: Mid',
            rows: [counted(mid1), counted(mid2)],
          },
        ]),
      );
    });
  });

  describe('when a signup is awaiting review of an update', () => {
    it('lists it at the prog point its earlier review confirmed', async ({
      flow,
    }) => {
      signup(flow, 'updating', {
        status: SignupStatus.UPDATE_PENDING,
        progPoint: 'P1 Opener',
        progPointRequested: 'P3 Enrage',
      });
      flow.raidHelper.addEvent(EVENT_ID, {
        title: TITLE,
        signUps: [signUp('updating', 'Gunbreaker')],
      });

      await expect(roster(flow)).resolves.toEqual(
        rosterReplies([
          {
            label: 'Phase 1: Opener',
            rows: [counted(signUp('updating', 'Gunbreaker'))],
          },
        ]),
      );
    });
  });

  describe('when signed-up players have no counted signup for the encounter', () => {
    it('lists them last by their raid-helper name', async ({ flow }) => {
      signup(flow, 'pending', {});
      signup(flow, 'declined', { status: SignupStatus.DECLINED });
      seedSignup(flow, {
        discordId: 'other-encounter',
        encounter: Encounter.TOP,
        status: SignupStatus.APPROVED,
        progPoint: 'P5 Delta',
      });
      approvedAt(flow, 'approved', 'P1 Opener');
      flow.raidHelper.addEvent(EVENT_ID, {
        title: TITLE,
        signUps: [
          signUp('pending', 'Paladin'),
          signUp('declined', 'Bard', 'Ranged'),
          signUp('other-encounter', 'Monk', 'Melee'),
          signUp('no-signup', 'Sage', 'Healer'),
          signUp('approved', 'Warrior'),
        ],
      });

      await expect(roster(flow)).resolves.toEqual(
        rosterReplies([
          {
            label: 'Phase 1: Opener',
            rows: [counted(signUp('approved', 'Warrior'))],
          },
          {
            label: 'No signup / not approved',
            rows: [
              uncounted(signUp('pending', 'Paladin')),
              uncounted(signUp('declined', 'Bard', 'Ranged')),
              uncounted(signUp('other-encounter', 'Monk', 'Melee')),
              uncounted(signUp('no-signup', 'Sage', 'Healer')),
            ],
          },
        ]),
      );
    });
  });

  describe('when approved players have no prog point, or one the encounter no longer has', () => {
    it('lists them under approved, no prog point', async ({ flow }) => {
      approvedAt(flow, 'none');
      approvedAt(flow, 'deleted', 'P9 Deleted');
      flow.raidHelper.addEvent(EVENT_ID, {
        title: TITLE,
        signUps: [
          signUp('none', 'Scholar', 'Healer'),
          signUp('deleted', 'Ninja', 'Melee'),
        ],
      });

      await expect(roster(flow)).resolves.toEqual(
        rosterReplies([
          {
            label: 'Approved, no prog point',
            rows: [
              counted(signUp('none', 'Scholar', 'Healer')),
              counted(signUp('deleted', 'Ninja', 'Melee')),
            ],
          },
        ]),
      );
    });
  });

  describe('when someone signed up as absent', () => {
    it('leaves them out', async ({ flow }) => {
      approvedAt(flow, 'present', 'P1 Opener');
      approvedAt(flow, 'absent', 'P1 Opener');
      flow.raidHelper.addEvent(EVENT_ID, {
        title: TITLE,
        signUps: [
          signUp('present', 'Reaper', 'Melee'),
          { userId: 'absent', name: 'absent rh', className: 'Absence' },
        ],
      });

      await expect(roster(flow)).resolves.toEqual(
        rosterReplies([
          {
            label: 'Phase 1: Opener',
            rows: [counted(signUp('present', 'Reaper', 'Melee'))],
          },
        ]),
      );
    });
  });

  describe('when the event only has absences', () => {
    it('says it has no sign-ups', async ({ flow }) => {
      flow.raidHelper.addEvent(EVENT_ID, {
        title: TITLE,
        signUps: [
          { userId: 'absent', name: 'absent rh', className: 'Absence' },
        ],
      });

      await expect(roster(flow)).resolves.toEqual([
        privateReply(ADMIN.id, { content: 'This event has no sign-ups.' }),
      ]);
    });
  });

  describe('when the roster is too long for one message', () => {
    it('lists every player, continuing in further private messages', async ({
      flow,
    }) => {
      const ids = Array.from({ length: 130 }, (_, i) => `player-${i + 1}`);
      for (const id of ids) {
        signup(flow, id, {
          status: SignupStatus.APPROVED,
          progPoint: 'P1 Opener',
          character: `${id} with a long name`,
          world: 'Gilgamesh',
        });
      }
      flow.raidHelper.addEvent(EVENT_ID, {
        title: TITLE,
        signUps: ids.map((id) => signUp(id, 'Darkknight')),
      });
      const expected = rosterReplies([
        {
          label: 'Phase 1: Opener',
          rows: ids.map((id) => ({
            ...uncounted(signUp(id, 'Darkknight')),
            character: { name: `${id} with a long name`, world: 'Gilgamesh' },
          })),
        },
      ]);

      expect(expected).toHaveLength(2);
      await expect(roster(flow)).resolves.toEqual(expected);
    });
  });

  describe('when the admin asks for a list', () => {
    it('lists each player by mention, with or without a counted signup', async ({
      flow,
    }) => {
      approvedAt(flow, 'enrage', 'P3 Enrage');
      flow.raidHelper.addEvent(EVENT_ID, {
        title: TITLE,
        signUps: [
          signUp('enrage', 'Whitemage', 'Healer'),
          signUp('no-signup', 'Sage', 'Healer'),
        ],
      });

      await expect(roster(flow, { format: 'list' })).resolves.toEqual(
        rosterReplies(
          [
            {
              label: 'Phase 3: Enrage',
              partyStatus: PartyStatus.ProgParty,
              rows: [counted(signUp('enrage', 'Whitemage', 'Healer'))],
            },
            {
              label: 'No signup / not approved',
              rows: [uncounted(signUp('no-signup', 'Sage', 'Healer'))],
            },
          ],
          'list',
        ),
      );
    });
  });

  describe('when raid-helper has no event with that ID', () => {
    it('says it could not find it', async ({ flow }) => {
      await expect(roster(flow)).resolves.toEqual([
        privateReply(ADMIN.id, {
          content: `Couldn't find a raid-helper event with ID \`${EVENT_ID}\`.`,
        }),
      ]);
    });
  });

  describe('when the ID is not a raid-helper event ID', () => {
    it('says what an event ID looks like', async ({ flow }) => {
      await expect(roster(flow, { event: 'not-an-id' })).resolves.toEqual([
        privateReply(ADMIN.id, {
          content:
            "That isn't a raid-helper event ID. Use the event's ID or its Discord message ID, which is all digits.",
        }),
      ]);
    });
  });

  describe('when raid-helper cannot be reached', () => {
    it('replies with a command error, privately', async ({ flow }) => {
      flow.raidHelper.goOffline();

      const replies = await roster(flow);

      expectCommandErrorReported(flow, 'fetch failed');
      expect(replies).toEqual([commandErrorReply(flow, ADMIN.id)]);
    });
  });
});
