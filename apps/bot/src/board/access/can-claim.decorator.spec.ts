import type { BoardAccess } from '@ulti-project/shared';
import { describe, expect, it } from 'vitest';
import { claimRefusal } from './can-claim.decorator.js';

const FROGS = Object.freeze({
  id: 'frg',
  name: 'Frogs',
  tag: 'FRG',
  color: '#16a34a',
});
const OWLS = Object.freeze({
  id: 'owl',
  name: 'Owls',
  tag: 'OWL',
  color: '#7c3aed',
});
const JSON_TYPE = 'application/json; charset=utf-8';

/** The status and body a refusal answers with, or undefined if the claim may go ahead. */
function refusal(access: BoardAccess, contentType: string | undefined) {
  const error = claimRefusal(access, contentType);
  return error && { status: error.getStatus(), body: error.body };
}

describe('claimRefusal', () => {
  it('lets a squad member claim with a JSON body', () => {
    expect(refusal({ kind: 'squad', squad: FROGS }, JSON_TYPE)).toBe(undefined);
  });

  it('refuses a viewer with 403 no-squad', () => {
    expect(refusal({ kind: 'viewer' }, JSON_TYPE)).toEqual({
      status: 403,
      body: { reason: 'no-squad' },
    });
  });

  it('refuses a member of two squads with 403 squad-conflict', () => {
    expect(
      refusal({ kind: 'squad-conflict', squads: [FROGS, OWLS] }, JSON_TYPE),
    ).toEqual({ status: 403, body: { reason: 'squad-conflict' } });
  });

  it('refuses a squad member posting a form with 415 json-required', () => {
    expect(
      refusal(
        { kind: 'squad', squad: FROGS },
        'application/x-www-form-urlencoded',
      ),
    ).toEqual({ status: 415, body: { reason: 'json-required' } });
  });

  it('refuses a squad member sending no body type with 415 json-required', () => {
    expect(refusal({ kind: 'squad', squad: FROGS }, undefined)).toEqual({
      status: 415,
      body: { reason: 'json-required' },
    });
  });
});
