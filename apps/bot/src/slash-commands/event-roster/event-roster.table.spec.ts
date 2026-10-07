import type { APIEmbed } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  type RosterGroup,
  type RosterRow,
  rosterEmbeds,
} from './event-roster.table.js';

const block = (...lines: string[]) => `\`\`\`\n${lines.join('\n')}\n\`\`\``;

const render = (groups: RosterGroup[]) =>
  rosterEmbeds({ title: 'Event', description: 'Desc', groups });

/** `count` rows that each print 32 characters wide */
const rows = (count: number): RosterRow[] =>
  Array.from({ length: count }, (_, i) => ({
    name: `Player ${String(i + 1).padStart(2, '0')}`,
    world: 'Worldname',
    job: 'Darkknight',
  }));

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
  it('prints each group as a table padded to its widest cells, with its count', () => {
    expect(
      render([
        {
          label: 'P3',
          rows: [
            { name: 'Alice Smith', world: 'Gilgamesh', job: 'Darkknight' },
            { name: 'Bob', world: 'Jenova', job: 'Whitemage' },
          ],
        },
        {
          label: 'P2',
          rows: [{ name: 'Carol Lee', world: 'Faerie', job: 'Bard' }],
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

  it('cuts long cells short with an ellipsis', () => {
    const [embed] = render([
      {
        label: 'P1',
        rows: [
          {
            name: 'Abcdefghijklmnopqrstuvwxyz',
            world: 'Worldworldworldworld',
            job: 'Classclassclass',
          },
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
      { title: 'Event (cont.)', description: undefined, fields: ['G26 (1)'] },
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
