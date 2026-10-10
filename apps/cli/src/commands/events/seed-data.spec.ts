import {
  Encounter,
  type EventPhase,
  participantDocId,
} from '@ulti-project/shared';
import { describe, expect, it } from 'vitest';
import { isSeeded, seedPlayers, seedRefusal } from './seed-data.ts';

describe('seedRefusal', () => {
  const dev = { ALLOW_TEST_SEED: 'true', FIRESTORE_DATABASE_ID: 'dev-db' };

  it('allows a development environment', () => {
    expect(seedRefusal(dev)).toBeUndefined();
  });

  it('refuses without ALLOW_TEST_SEED', () => {
    expect(seedRefusal({ ...dev, ALLOW_TEST_SEED: undefined })).toContain(
      'ALLOW_TEST_SEED',
    );
  });

  it('refuses without a database id', () => {
    expect(seedRefusal({ ...dev, FIRESTORE_DATABASE_ID: '' })).toContain(
      'FIRESTORE_DATABASE_ID',
    );
  });

  it('refuses under pnpm cli:prod', () => {
    expect(seedRefusal({ ...dev, npm_lifecycle_event: 'cli:prod' })).toContain(
      'cli:prod',
    );
  });

  it('refuses in production', () => {
    expect(seedRefusal({ ...dev, NODE_ENV: 'production' })).toContain(
      'production',
    );
  });
});

describe('seedPlayers', () => {
  const phase = (bucket: EventPhase['bucket'], order: number): EventPhase => ({
    roleId: `role-${bucket}-${order}`,
    label: `${bucket} ${order}`,
    order,
    bucket,
  });
  const encounters = [
    { encounter: Encounter.FRU, phases: [phase('prog', 0), phase('prog', 1)] },
    { encounter: Encounter.TOP, phases: [phase('prog', 0), phase('clear', 1)] },
    { encounter: Encounter.DSR, phases: [phase('clear', 2)] },
  ];
  const now = new Date('2026-10-09T12:00:00Z');

  it('spreads the count over every encounter and both buckets with stable, unique, marked ids', () => {
    const players = seedPlayers(32, encounters, now);

    expect(players).toHaveLength(32);
    expect(new Set(players.map((p) => p.encounter))).toEqual(
      new Set([Encounter.FRU, Encounter.TOP, Encounter.DSR]),
    );
    expect(new Set(players.map((p) => p.phase.bucket))).toEqual(
      new Set(['prog', 'clear']),
    );
    expect(
      players
        .filter((p) => p.encounter === Encounter.TOP)
        .map((p) => p.phase.bucket),
    ).toContain('clear');
    const ids = players.map((p) => participantDocId(p.discordId, p.encounter));
    expect(new Set(ids).size).toBe(32);
    expect(players.every((p) => isSeeded(p.discordId))).toBe(true);
    expect(seedPlayers(32, encounters, now)).toEqual(players);
  });

  it('never marks a real snowflake as seeded', () => {
    expect(isSeeded('999000123456789012')).toBe(false);
    expect(isSeeded('1234567890123456789')).toBe(false);
  });
});
