import type { SignupDocument } from '@ulti-project/shared';

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

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function toPublicSignup(fields: Record<string, unknown>): PublicSignup {
  return {
    character: asString(fields.character),
    world: asString(fields.world),
    role: asString(fields.role),
    progPoint: asString(fields.progPoint),
    partyStatus: asString(fields.partyStatus),
  } satisfies Record<(typeof ALLOWLIST)[number], string>;
}
