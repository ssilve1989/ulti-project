import { PartyStatus } from '@ulti-project/shared';
import { type APIEmbed, Colors } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  type RosterFormat,
  type RosterGroup,
  type RosterRow,
  rosterMessages,
} from './event-roster.embeds.js';

const block = (...lines: string[]) => `\`\`\`\n${lines.join('\n')}\n\`\`\``;

const render = (groups: RosterGroup[], format: RosterFormat) =>
  rosterMessages({ title: 'Event', description: 'Desc', groups, format });

/** The table format's embeds, one per message */
const renderTable = (groups: RosterGroup[]) =>
  render(groups, 'table').flatMap(({ embeds }) => embeds);

/** A member with a counted signup */
const member = (
  discordId: string,
  name: string,
  world: string,
  specName: string,
  className = 'Tank',
): RosterRow => ({
  discordId,
  raidHelperName: `${name} rh`,
  className,
  specName,
  character: { name, world },
});

/** A member without a counted signup */
const unmatched = (
  discordId: string,
  raidHelperName: string,
  className: string,
  specName?: string,
): RosterRow => ({ discordId, raidHelperName, className, specName });

/** `count` tanks: table rows print 32 wide, and list entries 50 */
const rows = (count: number): RosterRow[] =>
  Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return member(
      `1234567890123456${n}`,
      `Player ${n}`,
      'Worldname',
      'Darkknight',
    );
  });

const fieldNames = (embeds: APIEmbed[]) =>
  embeds.map(({ title, description, fields }) => ({
    title,
    description,
    fields: fields?.map(({ name }) => name),
  }));

const size = ({ title = '', description = '', fields = [] }: APIEmbed) =>
  title.length +
  description.length +
  fields.reduce((sum, { name, value }) => sum + name.length + value.length, 0);

const EM_SPACE = ' ';
const NO_ONE = '—';

describe('rosterMessages', () => {
  describe('as a table', () => {
    it('prints each group as a table padded to its widest cells, with its count, in one message', () => {
      expect(
        render(
          [
            {
              label: 'P3',
              rows: [
                member('1', 'Alice Smith', 'Gilgamesh', 'Darkknight'),
                member('2', 'Bob', 'Jenova', 'Whitemage', 'Healer'),
              ],
            },
            {
              label: 'P2',
              rows: [member('3', 'Carol Lee', 'Faerie', 'Bard', 'Ranged')],
            },
          ],
          'table',
        ),
      ).toEqual([
        {
          embeds: [
            {
              title: 'Event',
              description: 'Desc',
              fields: [
                {
                  name: 'P3 (2)',
                  value: block(
                    `${'Name'.padEnd(13)}${'World'.padEnd(11)}Class`,
                    `${'Alice Smith'.padEnd(13)}${'Gilgamesh'.padEnd(11)}Darkknight`,
                    `${'Bob'.padEnd(13)}${'Jenova'.padEnd(11)}Whitemage`,
                  ),
                },
                {
                  name: 'P2 (1)',
                  value: block(
                    `${'Name'.padEnd(11)}${'World'.padEnd(8)}Class`,
                    `${'Carol Lee'.padEnd(11)}${'Faerie'.padEnd(8)}Bard`,
                  ),
                },
              ],
            },
          ],
        },
      ]);
    });

    it('shows members without a signup by their raid-helper name and class, with no world', () => {
      const [embed] = renderTable([
        { label: 'No signup', rows: [unmatched('1', 'Dave', 'Allrounder')] },
      ]);

      expect(embed?.fields).toEqual([
        {
          name: 'No signup (1)',
          value: block(
            `${'Name'.padEnd(6)}${'World'.padEnd(7)}Class`,
            `${'Dave'.padEnd(6)}${'-'.padEnd(7)}Allrounder`,
          ),
        },
      ]);
    });

    it('cuts long cells short with an ellipsis', () => {
      const [embed] = renderTable([
        {
          label: 'P1',
          rows: [
            member(
              '1',
              'Abcdefghijklmnopqrstuvwxyz',
              'Worldworldworldworld',
              'Classclassclass',
            ),
          ],
        },
      ]);

      expect(embed?.fields).toEqual([
        {
          name: 'P1 (1)',
          value: block(
            `${'Name'.padEnd(22)}${'World'.padEnd(14)}Class`,
            'Abcdefghijklmnopqrs…  Worldworldw…  Classclassc…',
          ),
        },
      ]);
    });

    it('swaps backticks in cells for a lookalike, so names cannot close the code block', () => {
      const [embed] = renderTable([
        { label: 'P1', rows: [member('1', 'a```**b**', 'w`', 'j')] },
      ]);

      expect(embed?.fields).toEqual([
        {
          name: 'P1 (1)',
          value: block(
            `${'Name'.padEnd(11)}${'World'.padEnd(7)}Class`,
            `${'aˋˋˋ**b**'.padEnd(11)}${'wˋ'.padEnd(7)}j`,
          ),
        },
      ]);
    });

    it('continues a group too long for one field in another, repeating the header', () => {
      // header (27) + 29 rows of 32, with newlines and fences, is 992 characters; a 30th row passes 1024
      const [embed] = renderTable([{ label: 'Group', rows: rows(30) }]);

      expect(embed?.fields?.map(({ name }) => name)).toEqual([
        'Group (30)',
        'Group (cont.)',
      ]);
      expect(embed?.fields?.[0]?.value).toHaveLength(992);
      expect(embed?.fields?.[1]?.value).toEqual(
        block(
          `${'Name'.padEnd(11)}${'World'.padEnd(11)}Class`,
          `${'Player 30'.padEnd(11)}${'Worldname'.padEnd(11)}Darkknight`,
        ),
      );
    });

    it('starts another embed after 25 fields', () => {
      const groups = Array.from({ length: 26 }, (_, i) => ({
        label: `G${i + 1}`,
        rows: rows(1),
      }));

      expect(fieldNames(renderTable(groups))).toEqual([
        {
          title: 'Event',
          description: 'Desc',
          fields: groups.slice(0, 25).map(({ label }) => `${label} (1)`),
        },
        {
          title: 'Event (cont.)',
          description: undefined,
          fields: ['G26 (1)'],
        },
      ]);
    });

    it('starts another message before passing 6000 characters', () => {
      // each field is 999 characters, so the sixth would take the first embed past 6000
      const groups = Array.from({ length: 7 }, (_, i) => ({
        label: `G${i + 1}`,
        rows: rows(29),
      }));

      const messages = render(groups, 'table');
      const embeds = messages.flatMap((message) => message.embeds);

      expect(messages.map((message) => message.embeds.length)).toEqual([1, 1]);
      expect(fieldNames(embeds)).toEqual([
        {
          title: 'Event',
          description: 'Desc',
          fields: ['G1 (29)', 'G2 (29)', 'G3 (29)', 'G4 (29)', 'G5 (29)'],
        },
        {
          title: 'Event (cont.)',
          description: undefined,
          fields: ['G6 (29)', 'G7 (29)'],
        },
      ]);
      expect(embeds.map(size).every((characters) => characters <= 6000)).toBe(
        true,
      );
    });
  });

  describe('as a list', () => {
    it('shows each group as an embed in its party colour, with tank, healer and DPS columns, under a summary', () => {
      expect(
        render(
          [
            {
              label: 'Phase 5: Enrage',
              partyStatus: PartyStatus.ProgParty,
              rows: [
                member('1', 'aeo arcanist', 'jenova', 'PaladinFF', 'Tank'),
                member('2', 'zit ta', 'jenova', 'Whitemage', 'Healer'),
                member('3', 'bob', 'gilgamesh', 'Bard', 'Ranged'),
                member('4', 'tan ner', 'faerie', 'Blackmage', 'Magical'),
              ],
            },
            {
              label: 'No signup / not approved',
              rows: [unmatched('5', 'Valisha', 'Tank', 'Darkknight')],
            },
          ],
          'list',
        ),
      ).toEqual([
        {
          content: '**Event** — Desc · 5 signed up · 4 approved',
          embeds: [
            {
              title: '🔥 Phase 5: Enrage (4)',
              color: Colors.Orange,
              fields: [
                {
                  name: '🛡️ Tanks',
                  value: `\`PLD\` <@1>\n${EM_SPACE}Aeo Arcanist @ Jenova`,
                  inline: true,
                },
                {
                  name: '💚 Healers',
                  value: `\`WHM\` <@2>\n${EM_SPACE}Zit Ta @ Jenova`,
                  inline: true,
                },
                {
                  name: '⚔️ DPS',
                  value: [
                    '`BRD` <@3>',
                    `${EM_SPACE}Bob @ Gilgamesh`,
                    '`BLM` <@4>',
                    `${EM_SPACE}Tan Ner @ Faerie`,
                  ].join('\n'),
                  inline: true,
                },
              ],
            },
            {
              title: '❔ No signup / not approved (1)',
              color: Colors.Grey,
              fields: [
                { name: '🛡️ Tanks', value: '`DRK` <@5>', inline: true },
                { name: '💚 Healers', value: NO_ONE, inline: true },
                { name: '⚔️ DPS', value: NO_ONE, inline: true },
              ],
            },
          ],
        },
      ]);
    });

    it('lists members without a role under the columns, as flex or by their status', () => {
      const [message] = render(
        [
          {
            label: 'P1',
            partyStatus: PartyStatus.EarlyProgParty,
            rows: [
              member('1', 'aeo arcanist', 'jenova', '', 'Allrounder'),
              unmatched('2', 'Benchy', 'Bench'),
            ],
          },
        ],
        'list',
      );

      expect(message?.embeds).toEqual([
        {
          title: '🌱 P1 (2)',
          color: Colors.Green,
          fields: [
            { name: '🛡️ Tanks', value: NO_ONE, inline: true },
            { name: '💚 Healers', value: NO_ONE, inline: true },
            { name: '⚔️ DPS', value: NO_ONE, inline: true },
            {
              name: '🔄 Flex / Other',
              value: '`FLEX` <@1> — Aeo Arcanist @ Jenova\n`BENCH` <@2>',
              inline: false,
            },
          ],
        },
      ]);
    });

    it('escapes markdown and masked links in character names, so they show as typed', () => {
      const [message] = render(
        [
          {
            label: 'P1',
            partyStatus: PartyStatus.ClearParty,
            rows: [member('1', '[x](https://e.com)', 'w_', 'Warrior')],
          },
        ],
        'list',
      );

      expect(message?.embeds[0]?.fields?.[0]).toEqual({
        name: '🛡️ Tanks',
        value: `\`WAR\` <@1>\n${EM_SPACE}\\[x](https://e.com) @ W\\_`,
        inline: true,
      });
    });

    it('continues a group whose column passes 1024 characters in another embed', () => {
      // entries are 50 characters: 20 fit in 1024 (1019), a 21st passes it (1070)
      const [message] = render(
        [
          {
            label: 'G',
            partyStatus: PartyStatus.ProgParty,
            rows: rows(30),
          },
        ],
        'list',
      );

      expect(message?.embeds.map(({ title }) => title)).toEqual([
        '🔥 G (30)',
        '🔥 G (cont.)',
      ]);
      expect(message?.embeds[0]?.fields?.[0]?.value).toHaveLength(1019);
      expect(message?.embeds[1]?.fields?.[0]?.value.split('\n')).toHaveLength(
        20,
      );
    });

    it('starts another message after 10 embeds', () => {
      const groups = Array.from({ length: 11 }, (_, i) => ({
        label: `G${i + 1}`,
        partyStatus: PartyStatus.ProgParty,
        rows: rows(1),
      }));

      expect(
        render(groups, 'list').map(({ content, embeds }) => ({
          content,
          titles: embeds.map(({ title }) => title),
        })),
      ).toEqual([
        {
          content: '**Event** — Desc · 11 signed up · 11 approved',
          titles: groups.slice(0, 10).map(({ label }) => `🔥 ${label} (1)`),
        },
        { content: undefined, titles: ['🔥 G11 (1)'] },
      ]);
    });

    it('starts another message before its embeds pass 6000 characters', () => {
      // each embed is 1056 characters, so a sixth would take a message past 6000
      const groups = Array.from({ length: 6 }, (_, i) => ({
        label: `G${i + 1}`,
        partyStatus: PartyStatus.ProgParty,
        rows: rows(20),
      }));

      const messages = render(groups, 'list');

      expect(messages.map(({ embeds }) => embeds.length)).toEqual([5, 1]);
      expect(
        messages.every(
          ({ embeds }) =>
            embeds.reduce((sum, embed) => sum + size(embed), 0) <= 6000,
        ),
      ).toBe(true);
    });
  });
});
