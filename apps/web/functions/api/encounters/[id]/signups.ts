import type { PartyStatus, SignupStatus } from '@ulti-project/shared';
import { serveCached } from '../../../lib/cache.ts';
import {
  decodeFields,
  type FirestoreEnv,
  getDocument,
  runQuery,
} from '../../../lib/firestore-client.ts';
import { toPublicSignup } from '../../../lib/public-signup.ts';

// Local literals typed against the shared unions: a rename in @ulti-project/shared
// breaks this typecheck instead of silently changing behaviour. Importing the
// runtime const objects would pull firebase-admin into the Workers bundle.
const APPROVED: SignupStatus = 'APPROVED';
const CLEARED: PartyStatus = 'Cleared';

export const onRequestGet: PagesFunction<FirestoreEnv, 'id'> = (context) =>
  serveCached(context, async () => {
    const raw = context.params.id;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (!id) {
      return { status: 404, data: { error: 'encounter not found' } };
    }

    const encounter = await getDocument(context.env, `encounters/${id}`);
    if (!encounter) {
      return { status: 404, data: { error: 'encounter not found' } };
    }

    const docs = await runQuery(context.env, {
      from: [{ collectionId: 'signups' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'encounter' },
                op: 'EQUAL',
                value: { stringValue: id },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: APPROVED },
              },
            },
          ],
        },
      },
    });

    const data = docs
      .map(decodeFields)
      .filter((fields) => fields.partyStatus !== CLEARED)
      .map(toPublicSignup);

    return { status: 200, data };
  });
