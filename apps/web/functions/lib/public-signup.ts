import type { SignupDocument } from '@ulti-project/shared';
import { getString } from './firestore-client.ts';

export interface PublicSignup {
  character: string;
  world: string;
  role: string;
  progPoint: string;
  partyStatus: string;
}

// Compile-time guard: every allowlisted key must exist on SignupDocument, so a
// rename there breaks this build instead of silently changing the public shape.
const ALLOWLIST = [
  'character',
  'world',
  'role',
  'progPoint',
  'partyStatus',
] as const satisfies readonly (keyof SignupDocument)[];

export function toPublicSignup(fields: Record<string, unknown>): PublicSignup {
  return {
    character: getString(fields, 'character'),
    world: getString(fields, 'world'),
    role: getString(fields, 'role'),
    progPoint: getString(fields, 'progPoint'),
    partyStatus: getString(fields, 'partyStatus'),
  } satisfies Record<(typeof ALLOWLIST)[number], string>;
}
