export interface FirestoreEnv {
  GCP_PROJECT_ID: string;
  GCP_SERVICE_ACCOUNT_EMAIL?: string;
  GCP_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  FIRESTORE_EMULATOR_HOST?: string;
}

export interface FirestoreValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  nullValue?: null;
  arrayValue?: { values?: FirestoreValue[] };
}

export interface FirestoreRestDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export interface StructuredQuery {
  from: Array<{ collectionId: string }>;
  where?: unknown;
  limit?: number;
}

function decodeValue(value: FirestoreValue): unknown {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.nullValue !== undefined) return null;
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values ?? []).map(decodeValue);
  }
  return undefined;
}

export function decodeFields(
  doc: FirestoreRestDocument,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.fields ?? {})) {
    out[key] = decodeValue(value);
  }
  return out;
}

export function documentId(doc: FirestoreRestDocument): string {
  const segments = doc.name.split('/');
  return segments[segments.length - 1] ?? '';
}
