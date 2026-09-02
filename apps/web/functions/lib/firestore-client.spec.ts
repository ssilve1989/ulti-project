import { describe, expect, it } from 'vitest';
import {
  decodeFields,
  documentId,
  type FirestoreRestDocument,
} from './firestore-client.ts';

describe('decodeFields', () => {
  it('decodes each Firestore typed value to a plain JS value', () => {
    const doc: FirestoreRestDocument = {
      name: 'projects/p/databases/(default)/documents/signups/abc',
      fields: {
        character: { stringValue: 'Kholi Ruz' },
        active: { booleanValue: true },
        order: { integerValue: '5' },
        threshold: { doubleValue: 1.5 },
        notes: { nullValue: null },
        tags: {
          arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] },
        },
      },
    };

    expect(decodeFields(doc)).toEqual({
      character: 'Kholi Ruz',
      active: true,
      order: 5,
      threshold: 1.5,
      notes: null,
      tags: ['a', 'b'],
    });
  });

  it('returns an empty object when the document has no fields', () => {
    expect(decodeFields({ name: 'x/y' })).toEqual({});
  });
});

describe('documentId', () => {
  it('returns the last path segment of the document name', () => {
    expect(
      documentId({
        name: 'projects/p/databases/(default)/documents/encounters/FRU',
      }),
    ).toBe('FRU');
  });
});
