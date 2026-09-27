import { Encounter, PartyStatus, SignupStatus } from '@ulti-project/shared';
import {
  ButtonStyle,
  Colors,
  ComponentType,
  PermissionFlagsBits,
} from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import { privateReply } from '../../test-utils/replies.js';
import { seedSignup } from '../../test-utils/signups.js';
import {
  SEARCH_ENCOUNTER_SELECTOR_ID,
  SEARCH_NEXT_PAGE_BUTTON_ID,
  SEARCH_PREV_PAGE_BUTTON_ID,
  SEARCH_PROG_POINT_SELECT_ID,
  SEARCH_RESET_BUTTON_ID,
} from './search.components.js';

const GUILD = 'guild-1';
const ADMIN = Object.freeze({
  id: 'admin-1',
  username: 'admin',
  permissions: PermissionFlagsBits.Administrator,
});

function seedProgPoints(flow: FlowApp): void {
  const progPoint = (id: string, order: number, active = true) =>
    flow.db.seed(`encounters/${Encounter.DMU}/prog-points/${id}`, {
      id,
      label: `${id} label`,
      partyStatus: PartyStatus.ProgParty,
      order,
      active,
    });
  progPoint('P5', 0);
  progPoint('P6', 1);
  progPoint('P7', 2);
  progPoint('P8', 3, false);
}

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

/** An approved DMU signup of player `n`'s (who plays `player <n>`) at `progPoint`. */
const approvedAt = (flow: FlowApp, n: number, progPoint: string) =>
  seedSignup(flow, {
    discordId: `player-${n}`,
    character: `player ${n}`,
    encounter: Encounter.DMU,
    status: SignupStatus.APPROVED,
    progPoint,
    partyStatus: PartyStatus.ProgParty,
  });

/** The admin runs /search; returns their reply once the bot has answered. */
async function search(flow: FlowApp) {
  const { reply } = flow.discord.command({
    userId: ADMIN.id,
    guildId: GUILD,
    commandName: 'search',
  });
  await flow.settle();
  return reply;
}

type Reply = Awaited<ReturnType<typeof search>>;

async function choose(flow: FlowApp, reply: Reply, value: string) {
  flow.discord.choose(reply(), value, ADMIN.id);
  await flow.settle();
}

async function press(flow: FlowApp, reply: Reply, buttonId: string) {
  flow.discord.click(reply(), buttonId, ADMIN.id);
  await flow.settle();
}

/** Runs /search and picks DMU, then `progPoint`. */
async function searchFrom(flow: FlowApp, progPoint: string) {
  const reply = await search(flow);
  await choose(flow, reply, Encounter.DMU);
  await choose(flow, reply, progPoint);
  return reply;
}

const shownToAdmin = (flow: FlowApp) =>
  flow.discord.repliesTo(ADMIN.id).map(shown);

/** The admin's private search message, showing `embed` and `components`. */
const searchMessage = (embed: object, components: unknown[]) => [
  privateReply(ADMIN.id, { embeds: [embed], components }),
];

const row = (...components: unknown[]) => ({
  type: ComponentType.ActionRow,
  components,
});

const START_EMBED = Object.freeze({
  title: 'Search Signups',
  description: 'Select an encounter to begin your search',
  color: Colors.Blue,
});

const ENCOUNTER_MENU = row({
  type: ComponentType.StringSelect,
  custom_id: SEARCH_ENCOUNTER_SELECTOR_ID,
  placeholder: 'Select an encounter',
  options: [{ label: 'Dancing Mad (Ultimate)', value: Encounter.DMU }],
});

const RESET_ROW = row({
  type: ComponentType.Button,
  custom_id: SEARCH_RESET_BUTTON_ID,
  label: 'Reset Search',
  style: ButtonStyle.Secondary,
});

const pageButtons = ({ first, last }: { first: boolean; last: boolean }) =>
  row(
    {
      type: ComponentType.Button,
      custom_id: SEARCH_PREV_PAGE_BUTTON_ID,
      label: 'Previous',
      style: ButtonStyle.Secondary,
      disabled: first,
    },
    {
      type: ComponentType.Button,
      custom_id: SEARCH_NEXT_PAGE_BUTTON_ID,
      label: 'Next',
      style: ButtonStyle.Secondary,
      disabled: last,
    },
  );

/** Player `n`'s lines in the results. */
const playerFields = (n: number, progPoint: string) => [
  {
    name: 'Character',
    value: `Player ${n} (<@player-${n}>)`,
    inline: true,
  },
  { name: 'Role', value: 'tank', inline: true },
  { name: 'Prog Point', value: progPoint, inline: true },
];

describe('Search', () => {
  describe('when an admin starts a search', () => {
    it('asks them, privately, to pick an encounter', async ({ flow }) => {
      await search(flow);

      expect(shownToAdmin(flow)).toEqual(
        searchMessage(START_EMBED, [ENCOUNTER_MENU]),
      );
    });
  });

  describe('when the admin picks an encounter', () => {
    it('asks for one of its active prog points, and offers a reset', async ({
      flow,
    }) => {
      const reply = await search(flow);

      await choose(flow, reply, Encounter.DMU);

      expect(shownToAdmin(flow)).toEqual(
        searchMessage(
          {
            title: 'Search Signups',
            description: 'Selected encounter: DMU\nNow select a prog point',
            color: Colors.Blue,
          },
          [
            row({
              type: ComponentType.StringSelect,
              custom_id: SEARCH_PROG_POINT_SELECT_ID,
              placeholder: 'Select a prog point',
              options: [
                { label: 'P5 label', value: 'P5' },
                { label: 'P6 label', value: 'P6' },
                { label: 'P7 label', value: 'P7' },
              ],
            }),
            RESET_ROW,
          ],
        ),
      );
    });
  });

  describe('when the admin picks a prog point', () => {
    it('lists the players of that encounter at it or beyond', async ({
      flow,
    }) => {
      approvedAt(flow, 1, 'P5');
      approvedAt(flow, 2, 'P7');
      approvedAt(flow, 3, 'P6');
      seedSignup(flow, {
        discordId: 'player-4',
        character: 'player 4',
        encounter: Encounter.TOP,
        status: SignupStatus.APPROVED,
        progPoint: 'P6',
        partyStatus: PartyStatus.ProgParty,
      });

      await searchFrom(flow, 'P6');

      expect(shownToAdmin(flow)).toEqual(
        searchMessage(
          {
            title: 'Search Results',
            description:
              'Found 2 player(s) for **DMU** at prog point: **P6 or beyond**',
            color: Colors.Green,
            fields: [...playerFields(3, 'P6'), ...playerFields(2, 'P7')],
          },
          [RESET_ROW],
        ),
      );
    });

    it('says when nobody is that far', async ({ flow }) => {
      approvedAt(flow, 1, 'P5');

      await searchFrom(flow, 'P7');

      expect(shownToAdmin(flow)).toEqual(
        searchMessage(
          {
            title: 'Search Results',
            description: 'No signups found for DMU at least at prog point: P7',
            color: Colors.Red,
          },
          [RESET_ROW],
        ),
      );
    });
  });

  describe('when more players are found than fit on a page', () => {
    const players = Array.from({ length: 9 }, (_, i) => i + 1);

    it.beforeEach(({ flow }) => {
      for (const player of players) approvedAt(flow, player, 'P6');
    });

    const FIRST_PAGE = searchMessage(
      {
        title: 'Search Results',
        description:
          'Found 9 player(s) for **DMU** at prog point: **P6 or beyond**\nPage 1/2',
        color: Colors.Green,
        fields: players
          .slice(0, 8)
          .flatMap((player) => playerFields(player, 'P6')),
      },
      [RESET_ROW, pageButtons({ first: true, last: false })],
    );

    it('shows the first eight, and a way to the next page', async ({
      flow,
    }) => {
      await searchFrom(flow, 'P6');

      expect(shownToAdmin(flow)).toEqual(FIRST_PAGE);
    });

    it('shows the rest on the next page', async ({ flow }) => {
      const reply = await searchFrom(flow, 'P6');

      await press(flow, reply, SEARCH_NEXT_PAGE_BUTTON_ID);

      expect(shownToAdmin(flow)).toEqual(
        searchMessage(
          {
            title: 'Search Results',
            description:
              'Found 9 player(s) for **DMU** at prog point: **P6 or beyond**\nPage 2/2',
            color: Colors.Green,
            fields: playerFields(9, 'P6'),
          },
          [RESET_ROW, pageButtons({ first: false, last: true })],
        ),
      );
    });

    it('goes back to the first page', async ({ flow }) => {
      const reply = await searchFrom(flow, 'P6');
      await press(flow, reply, SEARCH_NEXT_PAGE_BUTTON_ID);

      await press(flow, reply, SEARCH_PREV_PAGE_BUTTON_ID);

      expect(shownToAdmin(flow)).toEqual(FIRST_PAGE);
    });
  });

  describe('when the admin resets the search', () => {
    it('starts over from picking an encounter', async ({ flow }) => {
      const reply = await searchFrom(flow, 'P6');

      await press(flow, reply, SEARCH_RESET_BUTTON_ID);

      expect(shownToAdmin(flow)).toEqual(
        searchMessage(START_EMBED, [ENCOUNTER_MENU]),
      );
    });
  });

  describe('when searching fails', () => {
    it('reports it and leaves the prog point menu up', async ({ flow }) => {
      const reply = await search(flow);
      await choose(flow, reply, Encounter.DMU);
      const beforeFailure = shownToAdmin(flow);
      flow.db.goOffline();

      await choose(flow, reply, 'P6');

      flow.expectReported(/^Sentry exception: Error: 14 UNAVAILABLE/);
      flow.expectReported(/^error: \{\n\s+err: Error: 14 UNAVAILABLE/);
      flow.expectReported(
        /^error: Error: 14 UNAVAILABLE.*Failed to handle search component interaction/s,
      );
      expect(shownToAdmin(flow)).toEqual(beforeFailure);
    });
  });

  describe('when the search expires', () => {
    it('says so and removes its controls', async ({ flow }) => {
      await search(flow);

      flow.discord.expireAll();
      await flow.settle();

      expect(shownToAdmin(flow)).toEqual([
        privateReply(ADMIN.id, {
          content:
            'Search session has expired. Please run the command again if needed.',
          embeds: [START_EMBED],
        }),
      ]);
    });
  });
});
