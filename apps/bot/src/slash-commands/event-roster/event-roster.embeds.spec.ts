import type { APIEmbed } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  type RosterFormat,
  type RosterGroup,
  type RosterRow,
  rosterEmbeds,
} from './event-roster.embeds.js';

const block = (...lines: string[]) => `\`\`\`\n${lines.join('\n')}\n\`\`\``;

const render = (groups: RosterGroup[], format: RosterFormat = 'table') =>
  rosterEmbeds({ title: 'Event', description: 'Desc', groups, format });

/** A member with a counted signup */
const member = (
  discordId: string,
  name: string,
  world: string,
  job: string,
): RosterRow => ({
  discordId,
  raidHelperName: `${name} rh`,
  job,
  character: { name, world },
});

/** A member without a counted signup */
const unmatched = (
  discordId: string,
  raidHelperName: string,
  job: string,
): RosterRow => ({ discordId, raidHelperName, job });

/** `count` members whose table rows print 32 characters wide, and list lines 58 */
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

describe('rosterEmbeds', () => {
  describe('as a table', () => {
    it('prints each group as a table padded to its widest cells, with its count', () => {
      expect(
        render([
          {
            label: 'P3',
            rows: [
              member('1', 'Alice Smith', 'Gilgamesh', 'Darkknight'),
              member('2', 'Bob', 'Jenova', 'Whitemage'),
            ],
          },
          {
            label: 'P2',
            rows: [member('3', 'Carol Lee', 'Faerie', 'Bard')],
          },
        ]),
      ).toEqual([
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
      ]);
    });

    it('shows members without a signup by their raid-helper name, with no world', () => {
      const [embed] = render([
        { label: 'No signup', rows: [unmatched('1', 'Dave', 'Dragoon')] },
      ]);

      expect(embed.fields).toEqual([
        {
          name: 'No signup (1)',
          value: block(
            `${'Name'.padEnd(6)}${'World'.padEnd(7)}Class`,
            `${'Dave'.padEnd(6)}${'-'.padEnd(7)}Dragoon`,
          ),
        },
      ]);
    });

    it('cuts long cells short with an ellipsis', () => {
      const [embed] = render([
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

      expect(embed.fields).toEqual([
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
      const [embed] = render([
        { label: 'P1', rows: [member('1', 'a```**b**', 'w`', 'j')] },
      ]);

      expect(embed.fields).toEqual([
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
      const [embed] = render([{ label: 'Group', rows: rows(30) }]);

      expect(embed.fields?.map(({ name }) => name)).toEqual([
        'Group (30)',
        'Group (cont.)',
      ]);
      expect(embed.fields?.[0]?.value).toHaveLength(992);
      expect(embed.fields?.[1]?.value).toEqual(
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

      expect(fieldNames(render(groups))).toEqual([
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

    it('starts another embed before passing 6000 characters', () => {
      // each field is 999 characters, so the sixth would take the first embed past 6000
      const groups = Array.from({ length: 7 }, (_, i) => ({
        label: `G${i + 1}`,
        rows: rows(29),
      }));

      const embeds = render(groups);

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
    it('mentions each member with their character, world and job, or just their job without a signup', () => {
      expect(
        render(
          [
            {
              label: 'P3',
              rows: [
                member('111', 'Alice Smith', 'Gilgamesh', 'Darkknight'),
                member('222', 'Bob', 'Jenova', 'Whitemage'),
              ],
            },
            { label: 'No signup', rows: [unmatched('333', 'Dave', 'Dragoon')] },
          ],
          'list',
        ),
      ).toEqual([
        {
          title: 'Event',
          description: 'Desc',
          fields: [
            {
              name: 'P3 (2)',
              value: [
                '<@111> — Alice Smith · Gilgamesh · Darkknight',
                '<@222> — Bob · Jenova · Whitemage',
              ].join('\n'),
            },
            { name: 'No signup (1)', value: '<@333> — Dragoon' },
          ],
        },
      ]);
    });

    it('escapes markdown in names, so they show as typed', () => {
      const [embed] = render(
        [{ label: 'P1', rows: [member('1', 'a_b*c*', 'w~~', 'j')] }],
        'list',
      );

      expect(embed.fields).toEqual([
        { name: 'P1 (1)', value: '<@1> — a\\_b\\*c\\* · w\\~\\~ · j' },
      ]);
    });

    it('escapes masked links in names, so they cannot show as a disguised link', () => {
      const [embed] = render(
        [{ label: 'P1', rows: [member('1', '[x](https://e.com)', 'w', 'j')] }],
        'list',
      );

      expect(embed.fields).toEqual([
        { name: 'P1 (1)', value: '<@1> — \\[x](https://e.com) · w · j' },
      ]);
    });

    it('continues a group too long for one field in further fields', () => {
      // lines are 58 characters: 17 fit in 1024 (1002), an 18th passes it (1061)
      const group = rows(40);
      const [embed] = render([{ label: 'Group', rows: group }], 'list');

      expect(embed.fields?.map(({ name }) => name)).toEqual([
        'Group (40)',
        'Group (cont.)',
        'Group (cont.)',
      ]);
      expect(embed.fields?.[0]?.value).toHaveLength(1002);
      expect(embed.fields?.flatMap(({ value }) => value.split('\n'))).toEqual(
        group.map(
          ({ discordId, character }) =>
            `<@${discordId}> — ${character?.name} · Worldname · Darkknight`,
        ),
      );
    });
  });
});
