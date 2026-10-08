import { Encounter, PartyStatus } from '@ulti-project/shared';
import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  PermissionFlagsBits,
} from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import {
  commandErrorReply,
  expectCommandErrorReported,
  privateReply,
  textReply,
} from '../../test-utils/replies.js';
import { BLACKLIST_CHANNELS_SELECT_ID } from './subcommands/blacklist-channels/blacklist-channels.components.js';
import { EVENT_ORGANIZERS_SELECT_ID } from './subcommands/event-organizers/event-organizers.components.js';
import { PROG_POINT_ROLES_SELECT_ID } from './subcommands/prog-point-roles/edit-prog-point-roles.command-handler.js';
import {
  SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID,
  SETTINGS_VIEW_ENCOUNTER_SELECT_ID,
  SETTINGS_VIEW_OVERVIEW_BUTTON_ID,
  SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID,
} from './subcommands/view/view-settings.components.js';

const GUILD = 'guild-1';
/** The title of the shared test spreadsheet the flow app records against. */
const TEST_SPREADSHEET_TITLE = 'Copy of Ulti Project: Season 5 (FRU)';
const SETTINGS_PATH = `settings/${GUILD}`;
const ADMIN = Object.freeze({
  id: 'admin-1',
  username: 'admin',
  permissions: PermissionFlagsBits.ManageGuild,
});

const REVIEW_CHANNEL = 'review-channel';
const SIGNUP_CHANNEL = 'signup-channel';
const MODERATION_CHANNEL = 'moderation-channel';
const BLACKLIST_CHANNEL = 'blacklist-channel';
const OTHER_CHANNEL = 'other-channel';

const REVIEWER_ROLE = 'reviewer-role';
const OTHER_ROLE = 'other-role';
const PROG_ROLE = 'dmu-prog-role';
const CLEAR_ROLE = 'dmu-clear-role';
const P6_ROLE = 'dmu-p6-role';
const TOP_PROG_ROLE = 'top-prog-role';
const TOP_CLEAR_ROLE = 'top-clear-role';
const ORGANIZER_ROLE = 'organizer-role';
const RAID_LEAD_ROLE = 'raid-lead-role';

/** Settings a guild has once an admin has configured everything but spreadsheets. */
const CONFIGURED = Object.freeze({
  reviewChannel: REVIEW_CHANNEL,
  signupChannel: SIGNUP_CHANNEL,
  autoModChannelId: MODERATION_CHANNEL,
  blacklistChannelIds: [BLACKLIST_CHANNEL],
  reviewerRole: REVIEWER_ROLE,
  progRoles: { DMU: PROG_ROLE },
  clearRoles: { DMU: CLEAR_ROLE },
  progPointRoles: { DMU: { P6: P6_ROLE, P7: P6_ROLE } },
});

function givenAGuild(flow: FlowApp): void {
  for (const channel of [
    REVIEW_CHANNEL,
    SIGNUP_CHANNEL,
    MODERATION_CHANNEL,
    BLACKLIST_CHANNEL,
    OTHER_CHANNEL,
  ]) {
    flow.discord.addChannel(GUILD, channel);
  }
  for (const id of [
    REVIEWER_ROLE,
    PROG_ROLE,
    CLEAR_ROLE,
    P6_ROLE,
    TOP_PROG_ROLE,
    TOP_CLEAR_ROLE,
    ORGANIZER_ROLE,
    RAID_LEAD_ROLE,
  ]) {
    flow.discord.addRole(GUILD, { id, name: id });
  }
  flow.discord.addMember(ADMIN);
  const progPoint = (id: string, label: string, order: number) =>
    flow.db.seed(`encounters/${Encounter.DMU}/prog-points/${id}`, {
      id,
      label,
      partyStatus: PartyStatus.ProgParty,
      order,
      active: true,
    });
  progPoint('P6', 'P6 Enrage', 0);
  progPoint('P7', 'P7 Final Phase', 1);
}

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      const flow = await createFlowApp();
      givenAGuild(flow);
      return flow;
    },
    (flow) => flow.close(),
  ),
});

/** The admin runs `/settings <subcommand>`; returns their reply once the bot has answered. */
async function settings(
  flow: FlowApp,
  subcommand: string,
  options: Record<string, string> = {},
) {
  const { reply } = flow.discord.command({
    userId: ADMIN.id,
    guildId: GUILD,
    commandName: 'settings',
    subcommand,
    options,
  });
  await flow.settle();
  return reply;
}

const repliesToAdmin = (flow: FlowApp) =>
  flow.discord.repliesTo(ADMIN.id).map(shown);

describe('Settings', () => {
  describe('channels', () => {
    describe('when an admin sets every channel', () => {
      it.beforeEach(async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, { reviewerRole: REVIEWER_ROLE });
        await settings(flow, 'channels', {
          'signup-review-channel': REVIEW_CHANNEL,
          'signup-public-channel': SIGNUP_CHANNEL,
          'moderation-channel': MODERATION_CHANNEL,
        });
      });

      it('stores them alongside the other settings', ({ flow }) => {
        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          reviewerRole: REVIEWER_ROLE,
          reviewChannel: REVIEW_CHANNEL,
          signupChannel: SIGNUP_CHANNEL,
          autoModChannelId: MODERATION_CHANNEL,
        });
      });

      it('tells the admin, privately, they were updated', ({ flow }) => {
        expect(repliesToAdmin(flow)).toEqual([
          textReply(ADMIN.id, 'Channel settings updated!', {
            ephemeral: true,
          }),
        ]);
      });
    });

    describe('when an admin sets only some channels', () => {
      it('keeps the channels they left out', async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, {
          reviewChannel: REVIEW_CHANNEL,
          signupChannel: SIGNUP_CHANNEL,
          autoModChannelId: MODERATION_CHANNEL,
        });

        await settings(flow, 'channels', {
          'signup-review-channel': OTHER_CHANNEL,
        });

        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          reviewChannel: OTHER_CHANNEL,
          signupChannel: SIGNUP_CHANNEL,
          autoModChannelId: MODERATION_CHANNEL,
        });
      });
    });
  });

  describe('reviewer', () => {
    describe('when an admin sets the reviewer role', () => {
      it.beforeEach(async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, { reviewChannel: REVIEW_CHANNEL });
        await settings(flow, 'reviewer', { 'reviewer-role': REVIEWER_ROLE });
      });

      it('stores it alongside the other settings', ({ flow }) => {
        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          reviewChannel: REVIEW_CHANNEL,
          reviewerRole: REVIEWER_ROLE,
        });
      });

      it('tells the admin, privately, it was updated', ({ flow }) => {
        expect(repliesToAdmin(flow)).toEqual([
          textReply(ADMIN.id, 'Reviewer role updated!', { ephemeral: true }),
        ]);
      });
    });
  });

  describe('encounter-roles', () => {
    describe("when an admin sets an encounter's prog and clear roles", () => {
      it.beforeEach(async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, {
          progRoles: { TOP: TOP_PROG_ROLE },
          clearRoles: { TOP: TOP_CLEAR_ROLE },
        });
        await settings(flow, 'encounter-roles', {
          encounter: Encounter.DMU,
          'prog-role': PROG_ROLE,
          'clear-role': CLEAR_ROLE,
        });
      });

      it("stores them, keeping other encounters' roles", ({ flow }) => {
        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          progRoles: { TOP: TOP_PROG_ROLE, DMU: PROG_ROLE },
          clearRoles: { TOP: TOP_CLEAR_ROLE, DMU: CLEAR_ROLE },
        });
      });

      it('tells the admin, privately, they were updated', ({ flow }) => {
        expect(repliesToAdmin(flow)).toEqual([
          textReply(ADMIN.id, 'Encounter roles updated!', { ephemeral: true }),
        ]);
      });
    });
  });

  describe('spreadsheet', () => {
    describe('when an admin sets the spreadsheet', () => {
      it.beforeEach(async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, { reviewChannel: REVIEW_CHANNEL });
        await settings(flow, 'spreadsheet', { 'spreadsheet-id': 'sheet-1' });
      });

      it('stores it alongside the other settings', ({ flow }) => {
        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          reviewChannel: REVIEW_CHANNEL,
          spreadsheetId: 'sheet-1',
        });
      });

      it('tells the admin, privately, it was updated', ({ flow }) => {
        expect(repliesToAdmin(flow)).toEqual([
          textReply(ADMIN.id, 'Spreadsheet settings updated!', {
            ephemeral: true,
          }),
        ]);
      });
    });

    describe('when other settings changed elsewhere since the bot last read them', () => {
      it('keeps the newer settings', async ({ flow }) => {
        await settings(flow, 'reviewer', { 'reviewer-role': REVIEWER_ROLE });
        flow.db.seed(SETTINGS_PATH, { reviewerRole: OTHER_ROLE });

        await settings(flow, 'spreadsheet', { 'spreadsheet-id': 'sheet-1' });

        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          reviewerRole: OTHER_ROLE,
          spreadsheetId: 'sheet-1',
        });
      });
    });
  });

  describe('prog-point-roles', () => {
    /** The menu of DMU's prog points the admin picks from; several can be picked. */
    const progPointMenu = {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: PROG_POINT_ROLES_SELECT_ID,
          options: [
            { label: 'P6 Enrage', value: 'P6' },
            { label: 'P7 Final Phase', value: 'P7' },
          ],
          min_values: 1,
          max_values: 2,
        },
      ],
    };

    const choose = async (
      flow: FlowApp,
      reply: Awaited<ReturnType<typeof settings>>,
      progPoints: string[],
    ) => {
      flow.discord.choose(reply(), progPoints, ADMIN.id);
      await flow.settle();
    };

    describe.each([
      [
        'a role',
        { role: P6_ROLE },
        `the prog points that should assign <@&${P6_ROLE}>`,
      ],
      ['no role', {}, 'the prog points whose role mappings should be removed'],
    ])('when an admin runs it with %s', (_, role, which) => {
      it(`asks them, privately, to select ${which}`, async ({ flow }) => {
        await settings(flow, 'prog-point-roles', {
          encounter: Encounter.DMU,
          ...role,
        });
        const prompt = repliesToAdmin(flow);
        // the prompt would otherwise time out as the app closes
        flow.discord.expireAll();
        await flow.settle();

        expect(prompt).toEqual([
          privateReply(ADMIN.id, {
            content: `Select ${which}`,
            components: [progPointMenu],
          }),
        ]);
      });
    });

    describe('when an admin maps prog points to a role', () => {
      describe('and picks them', () => {
        it.beforeEach(async ({ flow }) => {
          flow.db.seed(SETTINGS_PATH, {
            progPointRoles: { TOP: { P5: TOP_PROG_ROLE } },
          });
          const reply = await settings(flow, 'prog-point-roles', {
            encounter: Encounter.DMU,
            role: P6_ROLE,
          });
          await choose(flow, reply, ['P6', 'P7']);
        });

        it("stores the mappings, keeping other encounters'", ({ flow }) => {
          expect(flow.db.read(SETTINGS_PATH)).toEqual({
            progPointRoles: {
              TOP: { P5: TOP_PROG_ROLE },
              DMU: { P6: P6_ROLE, P7: P6_ROLE },
            },
          });
        });

        it('replaces the menu with what was mapped', ({ flow }) => {
          expect(repliesToAdmin(flow)).toEqual([
            privateReply(ADMIN.id, {
              content: `Mapped 2 prog point(s) to <@&${P6_ROLE}>`,
            }),
          ]);
        });
      });
    });

    describe('when an admin removes the mapping of prog points', () => {
      it.beforeEach(async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, {
          progPointRoles: { DMU: { P6: P6_ROLE, P7: P6_ROLE } },
        });
        const reply = await settings(flow, 'prog-point-roles', {
          encounter: Encounter.DMU,
        });
        await choose(flow, reply, ['P7']);
      });

      it('removes only the picked mappings', ({ flow }) => {
        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          progPointRoles: { DMU: { P6: P6_ROLE } },
        });
      });

      it('replaces the menu with how many were removed', ({ flow }) => {
        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content: 'Removed mappings for 1 prog point(s)',
          }),
        ]);
      });
    });

    describe('when the admin does not pick in time', () => {
      it('says the menu expired, removing it, and stores nothing', async ({
        flow,
      }) => {
        await settings(flow, 'prog-point-roles', {
          encounter: Encounter.DMU,
          role: P6_ROLE,
        });

        flow.discord.expireAll();
        await flow.settle();

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content:
              'This menu has expired. Run /settings prog-point-roles again if needed.',
          }),
        ]);
        expect(flow.db.read(SETTINGS_PATH)).toBeUndefined();
      });
    });
  });

  describe('blacklist-channels', () => {
    const INSTRUCTIONS =
      'Select the channels that should receive blacklist notifications. Your selection replaces the current list; submit an empty selection to disable notifications.';

    /** The channel menu, with `selected` as its current channels. */
    const channelMenu = (selected: string[]) => ({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.ChannelSelect,
          custom_id: BLACKLIST_CHANNELS_SELECT_ID,
          placeholder: 'Select blacklist notification channels',
          channel_types: [ChannelType.GuildText],
          min_values: 0,
          max_values: 25,
          default_values: selected.map((id) => ({ id, type: 'channel' })),
        },
      ],
    });

    const pick = async (
      flow: FlowApp,
      reply: Awaited<ReturnType<typeof settings>>,
      channelIds: string[],
    ) => {
      flow.discord.chooseChannels(reply(), channelIds, ADMIN.id);
      await flow.settle();
    };

    describe('when an admin opens the menu', () => {
      it('shows them, privately, the channels notified now', async ({
        flow,
      }) => {
        flow.db.seed(SETTINGS_PATH, { blacklistChannelIds: [OTHER_CHANNEL] });

        await settings(flow, 'blacklist-channels');

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content: INSTRUCTIONS,
            components: [channelMenu([OTHER_CHANNEL])],
          }),
        ]);
      });

      it('shows the moderation channel as notified for a guild that never chose blacklist channels', async ({
        flow,
      }) => {
        flow.db.seed(SETTINGS_PATH, { autoModChannelId: MODERATION_CHANNEL });

        await settings(flow, 'blacklist-channels');

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content: INSTRUCTIONS,
            components: [channelMenu([MODERATION_CHANNEL])],
          }),
        ]);
      });
    });

    describe('when the admin picks channels', () => {
      it.beforeEach(async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, { autoModChannelId: MODERATION_CHANNEL });
        const reply = await settings(flow, 'blacklist-channels');
        await pick(flow, reply, [BLACKLIST_CHANNEL, OTHER_CHANNEL]);
      });

      it('stores them as the channels to notify', ({ flow }) => {
        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          autoModChannelId: MODERATION_CHANNEL,
          blacklistChannelIds: [BLACKLIST_CHANNEL, OTHER_CHANNEL],
        });
      });

      it('confirms them under the menu, which keeps them selected', ({
        flow,
      }) => {
        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content: `${INSTRUCTIONS}\n\nSaved! Blacklist notifications will be sent to: <#${BLACKLIST_CHANNEL}>, <#${OTHER_CHANNEL}>`,
            components: [channelMenu([BLACKLIST_CHANNEL, OTHER_CHANNEL])],
          }),
        ]);
      });
    });

    describe('when the admin picks no channels', () => {
      it.beforeEach(async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, { blacklistChannelIds: [OTHER_CHANNEL] });
        const reply = await settings(flow, 'blacklist-channels');
        await pick(flow, reply, []);
      });

      it('stores that no channel is notified', ({ flow }) => {
        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          blacklistChannelIds: [],
        });
      });

      it('confirms notifications are disabled', ({ flow }) => {
        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content: `${INSTRUCTIONS}\n\nSaved! Blacklist notifications are now disabled.`,
            components: [channelMenu([])],
          }),
        ]);
      });
    });

    describe('when saving the picked channels fails', () => {
      it('reports it and leaves the menu as it was', async ({ flow }) => {
        const reply = await settings(flow, 'blacklist-channels');
        flow.db.goOffline();

        await pick(flow, reply, [BLACKLIST_CHANNEL]);

        flow.expectReported(/^Sentry exception: Error: 14 UNAVAILABLE/);
        flow.expectReported(
          /^error: \{\n\s+err: Error: 14 UNAVAILABLE.*Error: settings blacklist-channels menu: failed to handle a click/s,
        );
        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content: INSTRUCTIONS,
            components: [channelMenu([])],
          }),
        ]);
      });
    });

    describe('when the menu expires', () => {
      it('says so and removes the menu', async ({ flow }) => {
        await settings(flow, 'blacklist-channels');

        flow.discord.expireAll();
        await flow.settle();

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content:
              'This menu has expired. Run /settings blacklist-channels again if needed.',
          }),
        ]);
      });
    });
  });

  describe('event-organizers', () => {
    const INSTRUCTIONS =
      'Select the roles that can create and manage events. Your selection replaces the current list; submit an empty selection to remove every organizer role.';

    /** The role menu, with `selected` as its current roles. */
    const roleMenu = (selected: string[]) => ({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.RoleSelect,
          custom_id: EVENT_ORGANIZERS_SELECT_ID,
          placeholder: 'Select event organizer roles',
          min_values: 0,
          max_values: 25,
          default_values: selected.map((id) => ({ id, type: 'role' })),
        },
      ],
    });

    const pick = async (
      flow: FlowApp,
      reply: Awaited<ReturnType<typeof settings>>,
      roleIds: string[],
    ) => {
      flow.discord.chooseRoles(reply(), roleIds, ADMIN.id);
      await flow.settle();
    };

    describe('when an admin opens the menu', () => {
      it('shows them, privately, the current organizer roles', async ({
        flow,
      }) => {
        flow.db.seed(SETTINGS_PATH, { eventOrganizerRoles: [ORGANIZER_ROLE] });

        await settings(flow, 'event-organizers');

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content: INSTRUCTIONS,
            components: [roleMenu([ORGANIZER_ROLE])],
          }),
        ]);
      });
    });

    describe('when the admin picks two roles', () => {
      it.beforeEach(async ({ flow }) => {
        const reply = await settings(flow, 'event-organizers');
        await pick(flow, reply, [ORGANIZER_ROLE, RAID_LEAD_ROLE]);
      });

      it('stores them as the organizer roles', ({ flow }) => {
        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          eventOrganizerRoles: [ORGANIZER_ROLE, RAID_LEAD_ROLE],
        });
      });

      it('confirms them under the menu, which keeps them selected', ({
        flow,
      }) => {
        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content: `${INSTRUCTIONS}\n\nSaved! Event organizers: <@&${ORGANIZER_ROLE}>, <@&${RAID_LEAD_ROLE}>`,
            components: [roleMenu([ORGANIZER_ROLE, RAID_LEAD_ROLE])],
          }),
        ]);
      });
    });

    describe('when the admin picks no roles', () => {
      it.beforeEach(async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, { eventOrganizerRoles: [ORGANIZER_ROLE] });
        const reply = await settings(flow, 'event-organizers');
        await pick(flow, reply, []);
      });

      it('stores that no role organizes events', ({ flow }) => {
        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          eventOrganizerRoles: [],
        });
      });

      it('confirms nobody can create events', ({ flow }) => {
        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content: `${INSTRUCTIONS}\n\nSaved! Nobody can create events until organizer roles are set.`,
            components: [roleMenu([])],
          }),
        ]);
      });
    });

    describe('when the menu expires', () => {
      it('says so and removes the menu', async ({ flow }) => {
        await settings(flow, 'event-organizers');

        flow.discord.expireAll();
        await flow.settle();

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content:
              'This menu has expired. Run /settings event-organizers again if needed.',
          }),
        ]);
      });
    });
  });

  describe('job-emojis', () => {
    const SGE_EMOJI = '123456789012345678';
    const WHM_EMOJI = '223456789012345678';

    describe('when an admin sets a job emoji', () => {
      it.beforeEach(async ({ flow }) => {
        await settings(flow, 'job-emojis', {
          job: 'SGE',
          emoji: `<:sge:${SGE_EMOJI}>`,
        });
      });

      it('stores the emoji id for that job', ({ flow }) => {
        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          jobEmojis: { SGE: SGE_EMOJI },
        });
      });

      it('confirms privately', ({ flow }) => {
        expect(repliesToAdmin(flow)).toEqual([
          textReply(ADMIN.id, `Sage (SGE) now shows as <:SGE:${SGE_EMOJI}>`, {
            ephemeral: true,
          }),
        ]);
      });
    });

    describe('when an admin clears a job emoji', () => {
      it.beforeEach(async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, {
          jobEmojis: { SGE: SGE_EMOJI, WHM: WHM_EMOJI },
        });
        await settings(flow, 'job-emojis', { job: 'SGE' });
      });

      it('removes only that job', ({ flow }) => {
        expect(flow.db.read(SETTINGS_PATH)).toEqual({
          jobEmojis: { WHM: WHM_EMOJI },
        });
      });

      it('confirms privately that it shows as the job code', ({ flow }) => {
        expect(repliesToAdmin(flow)).toEqual([
          textReply(ADMIN.id, 'Sage (SGE) now shows as `SGE`', {
            ephemeral: true,
          }),
        ]);
      });
    });

    describe('when the emoji is not a custom emoji', () => {
      it('refuses it and stores nothing', async ({ flow }) => {
        await settings(flow, 'job-emojis', { job: 'SGE', emoji: '🙂' });

        expect({
          stored: flow.db.read(SETTINGS_PATH),
          replies: repliesToAdmin(flow),
        }).toEqual({
          stored: undefined,
          replies: [
            textReply(
              ADMIN.id,
              'That isn’t a custom emoji. Paste the emoji itself, or its id.',
              { ephemeral: true },
            ),
          ],
        });
      });
    });

    describe('when the emoji is animated', () => {
      it('refuses it and stores nothing', async ({ flow }) => {
        await settings(flow, 'job-emojis', {
          job: 'SGE',
          emoji: `<a:spin:${SGE_EMOJI}>`,
        });

        expect({
          stored: flow.db.read(SETTINGS_PATH),
          replies: repliesToAdmin(flow),
        }).toEqual({
          stored: undefined,
          replies: [
            textReply(
              ADMIN.id,
              "Animated emojis aren't supported. Use a static custom emoji.",
              { ephemeral: true },
            ),
          ],
        });
      });
    });
  });

  describe('view', () => {
    /** The section buttons, with `active` disabled as the one shown. */
    const navRow = (
      active: 'overview' | 'encounterRoles' | 'progPointRoles',
    ) => {
      const button = (
        section: typeof active,
        custom_id: string,
        label: string,
      ) => ({
        type: ComponentType.Button,
        custom_id,
        label,
        style: section === active ? ButtonStyle.Primary : ButtonStyle.Secondary,
        disabled: section === active,
      });
      return {
        type: ComponentType.ActionRow,
        components: [
          button('overview', SETTINGS_VIEW_OVERVIEW_BUTTON_ID, 'Overview'),
          button(
            'encounterRoles',
            SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID,
            'Encounter Roles',
          ),
          button(
            'progPointRoles',
            SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID,
            'Prog Point Roles',
          ),
        ],
      };
    };

    const field = (name: string, value: string) => ({
      name,
      value,
      inline: true,
    });

    /** The overview of the CONFIGURED settings, with `spreadsheetFields` among them. */
    const overview = (
      spreadsheetFields: unknown[] = [],
      jobEmojis = 'Not set',
      eventOrganizers = 'Not set',
    ) => ({
      title: 'Settings',
      description:
        'Ulti-Project Bot Settings — use the buttons below to view role mappings',
      fields: [
        field('Auto-Moderation Channel', `<#${MODERATION_CHANNEL}>`),
        field('Blacklist Channels', `<#${BLACKLIST_CHANNEL}>`),
        field('Review Channel', `<#${REVIEW_CHANNEL}>`),
        field('Signup Channel', `<#${SIGNUP_CHANNEL}>`),
        field('Reviewer Role', `<@&${REVIEWER_ROLE}>`),
        ...spreadsheetFields,
        field('Prog Roles', '1 encounter configured'),
        field('Clear Roles', '1 encounter configured'),
        field('Prog Point Roles', '1 encounter configured (2 prog points)'),
        field('Job emojis', jobEmojis),
        field('Event organizers', eventOrganizers),
      ],
    });

    const encounterMenu = (selected: boolean) => ({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: SETTINGS_VIEW_ENCOUNTER_SELECT_ID,
          placeholder: 'Select an encounter',
          options: [
            {
              label: 'Dancing Mad (Ultimate)',
              value: Encounter.DMU,
              default: selected,
            },
          ],
        },
      ],
    });

    const view = (flow: FlowApp) => settings(flow, 'view');

    const press = async (
      flow: FlowApp,
      reply: Awaited<ReturnType<typeof settings>>,
      buttonId: string,
    ) => {
      flow.discord.click(reply(), buttonId, ADMIN.id);
      await flow.settle();
    };

    describe('when the guild has no settings', () => {
      it('says so, privately', async ({ flow }) => {
        await view(flow);

        expect(repliesToAdmin(flow)).toEqual([
          textReply(ADMIN.id, 'No settings found!', { ephemeral: true }),
        ]);
      });
    });

    describe('when an admin views configured settings', () => {
      it.beforeEach(({ flow }) => {
        flow.db.seed(SETTINGS_PATH, CONFIGURED);
      });

      it('shows them an overview, privately', async ({ flow }) => {
        await view(flow);

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            embeds: [overview()],
            components: [navRow('overview')],
          }),
        ]);
      });

      it('lists the jobs with an emoji, in job order', async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, {
          ...CONFIGURED,
          jobEmojis: { WHM: '223456789012345678', PLD: '123456789012345678' },
        });

        await view(flow);

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            embeds: [
              overview(
                [],
                '<:PLD:123456789012345678> PLD <:WHM:223456789012345678> WHM',
              ),
            ],
            components: [navRow('overview')],
          }),
        ]);
      });

      it('lists the event organizer roles', async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, {
          ...CONFIGURED,
          eventOrganizerRoles: [ORGANIZER_ROLE, RAID_LEAD_ROLE],
        });

        await view(flow);

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            embeds: [
              overview(
                [],
                'Not set',
                `<@&${ORGANIZER_ROLE}>, <@&${RAID_LEAD_ROLE}>`,
              ),
            ],
            components: [navRow('overview')],
          }),
        ]);
      });

      it("shows each encounter's prog and clear roles", async ({ flow }) => {
        const reply = await view(flow);

        await press(flow, reply, SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID);

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            embeds: [
              {
                title: 'Settings — Encounter Roles',
                fields: [
                  field('Prog Roles', `**DMU:** <@&${PROG_ROLE}>`),
                  field('Clear Roles', `**DMU:** <@&${CLEAR_ROLE}>`),
                ],
              },
            ],
            components: [navRow('encounterRoles')],
          }),
        ]);
      });

      it('asks which encounter to show prog point roles for', async ({
        flow,
      }) => {
        const reply = await view(flow);

        await press(flow, reply, SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID);

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            embeds: [
              {
                title: 'Settings — Prog Point Roles',
                description:
                  'Select an encounter below to view its prog point role mappings.',
              },
            ],
            components: [navRow('progPointRoles'), encounterMenu(false)],
          }),
        ]);
      });

      it("shows the chosen encounter's prog point roles", async ({ flow }) => {
        const reply = await view(flow);
        await press(flow, reply, SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID);

        flow.discord.choose(reply(), Encounter.DMU, ADMIN.id);
        await flow.settle();

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            embeds: [
              {
                title: 'Settings — Prog Point Roles — DMU',
                description: `**P6:** <@&${P6_ROLE}>\n**P7:** <@&${P6_ROLE}>`,
              },
            ],
            components: [navRow('progPointRoles'), encounterMenu(true)],
          }),
        ]);
      });

      it('keeps the chosen encounter when coming back to prog point roles', async ({
        flow,
      }) => {
        const reply = await view(flow);
        await press(flow, reply, SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID);
        flow.discord.choose(reply(), Encounter.DMU, ADMIN.id);
        await flow.settle();

        await press(flow, reply, SETTINGS_VIEW_OVERVIEW_BUTTON_ID);
        const backToOverview = repliesToAdmin(flow);
        await press(flow, reply, SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID);

        expect([backToOverview, repliesToAdmin(flow)]).toEqual([
          [
            privateReply(ADMIN.id, {
              embeds: [overview()],
              components: [navRow('overview')],
            }),
          ],
          [
            privateReply(ADMIN.id, {
              embeds: [
                {
                  title: 'Settings — Prog Point Roles — DMU',
                  description: `**P6:** <@&${P6_ROLE}>\n**P7:** <@&${P6_ROLE}>`,
                },
              ],
              components: [navRow('progPointRoles'), encounterMenu(true)],
            }),
          ],
        ]);
      });

      it('says so and removes the buttons once the view expires', async ({
        flow,
      }) => {
        await view(flow);

        flow.discord.expireAll();
        await flow.settle();

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            content:
              'Settings view has expired. Run /settings view again if needed.',
            embeds: [overview()],
          }),
        ]);
      });
    });

    describe('when no prog point roles are configured', () => {
      it('says so, offering no encounter to choose', async ({ flow }) => {
        flow.db.seed(SETTINGS_PATH, { reviewChannel: REVIEW_CHANNEL });
        const reply = await view(flow);

        await press(flow, reply, SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID);

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            embeds: [
              {
                title: 'Settings — Prog Point Roles',
                description: 'No prog point roles configured.',
              },
            ],
            components: [navRow('progPointRoles')],
          }),
        ]);
      });
    });

    describe('when a spreadsheet is set', () => {
      it('links it by its title in the overview', async ({ flow }) => {
        const { spreadsheetId } = flow.sheets;
        flow.db.seed(SETTINGS_PATH, { ...CONFIGURED, spreadsheetId });

        await view(flow);

        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            embeds: [
              overview([
                field(
                  'Managed Spreadsheet',
                  `[${TEST_SPREADSHEET_TITLE}](https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0)`,
                ),
              ]),
            ],
            components: [navRow('overview')],
          }),
        ]);
      });

      it('shows a spreadsheet that no longer exists as deleted', async ({
        flow,
      }) => {
        const spreadsheetId = 'deleted-spreadsheet';
        flow.db.seed(SETTINGS_PATH, { ...CONFIGURED, spreadsheetId });

        await view(flow);

        flow.expectReported(
          /^Sentry exception: .*Requested entity was not found/,
        );
        flow.expectReported(/^error: .*Requested entity was not found/s);
        expect(repliesToAdmin(flow)).toEqual([
          privateReply(ADMIN.id, {
            embeds: [
              overview([
                field(
                  'Managed Spreadsheet',
                  `[Deleted Spreadsheet](https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0)`,
                ),
              ]),
            ],
            components: [navRow('overview')],
          }),
        ]);
      });
    });
  });

  describe.each([
    ['channels', { 'signup-review-channel': REVIEW_CHANNEL }],
    ['reviewer', { 'reviewer-role': REVIEWER_ROLE }],
    [
      'encounter-roles',
      {
        encounter: Encounter.DMU,
        'prog-role': PROG_ROLE,
        'clear-role': CLEAR_ROLE,
      },
    ],
    ['spreadsheet', { 'spreadsheet-id': 'sheet-1' }],
    ['prog-point-roles', { encounter: Encounter.DMU, role: P6_ROLE }],
    ['blacklist-channels', {}],
    ['view', {}],
  ])('%s, when Firestore cannot be reached', (subcommand, options) => {
    it('replies with a command error, privately', async ({ flow }) => {
      flow.db.goOffline();

      await settings(flow, subcommand, options);

      expectCommandErrorReported(flow, '14 UNAVAILABLE');
      expect(repliesToAdmin(flow)).toEqual([commandErrorReply(flow, ADMIN.id)]);
    });
  });
});
