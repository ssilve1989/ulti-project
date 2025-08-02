import { describe, expect, it } from 'vitest';
import { createFields } from './embed-helpers.js';

describe('createFields', () => {
  it('should filter out fields with nullish values', () => {
    const fields = [
      { name: 'Field1', value: 'value1', inline: true },
      { name: 'Field2', value: null, inline: true },
      { name: 'Field3', value: undefined, inline: false },
      { name: 'Field4', value: '', inline: true },
      { name: 'Field5', value: 'value5', inline: false },
    ];

    const result = createFields(fields);

    expect(result).toEqual([
      { name: 'Field1', value: 'value1', inline: true },
      { name: 'Field5', value: 'value5', inline: false },
    ]);
  });
});

it('should apply transform function when provided', () => {
  const fields = [
    { name: 'Regular', value: 'hello', inline: true },
    {
      name: 'Transformed',
      value: 'world',
      inline: false,
      transform: (value: string) => value.toUpperCase(),
    },
    { name: 'Null', value: null, inline: true },
  ];

  const result = createFields(fields);

  expect(result).toEqual([
    { name: 'Regular', value: 'hello', inline: true },
    { name: 'Transformed', value: 'WORLD', inline: false },
  ]);
});
