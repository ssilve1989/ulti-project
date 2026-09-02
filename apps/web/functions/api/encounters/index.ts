import { serveCached } from '../../lib/cache.ts';
import {
  decodeFields,
  documentId,
  type FirestoreEnv,
  getString,
  runQuery,
} from '../../lib/firestore-client.ts';

interface PublicEncounter {
  id: string;
  name: string;
  description: string;
  mode?: string;
  emoji?: string;
}

export const onRequestGet: PagesFunction<FirestoreEnv> = (context) =>
  serveCached(context, async () => {
    const docs = await runQuery(context.env, {
      from: [{ collectionId: 'encounters' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'active' },
          op: 'EQUAL',
          value: { booleanValue: true },
        },
      },
    });

    const data: PublicEncounter[] = docs.map((doc) => {
      const fields = decodeFields(doc);
      const encounter: PublicEncounter = {
        id: documentId(doc),
        name: getString(fields, 'name'),
        description: getString(fields, 'description'),
      };
      if (typeof fields.mode === 'string') encounter.mode = fields.mode;
      if (typeof fields.emoji === 'string') encounter.emoji = fields.emoji;
      return encounter;
    });

    return { status: 200, data };
  });
