import { describe, expect, it } from 'vitest';
import { Types } from '../modules/schemas.js';
import { envelope } from '../test/test-app.js';
import { dbErrorCode, isPermanentDbError, toRow } from './append.js';
import { monthsBetween } from './partitions.js';

describe('toRow', () => {
  it('reprend l’enveloppe colonne par colonne (identifiants en minuscules)', () => {
    const campaignId = crypto.randomUUID().toUpperCase();
    const e = envelope({
      roomId: campaignId,
      actor: { userId: crypto.randomUUID(), role: 'player', characterId: crypto.randomUUID() },
      visibility: 'owner',
      causationId: 'roll:1',
    });
    const r = toRow(e);
    expect(r).toMatchObject({
      id: e.id,
      campaignId: campaignId.toLowerCase(),
      type: 'character.hp_changed',
      version: 1,
      actorId: e.actor.userId,
      actorRole: 'player',
      actorCharacterId: e.actor.characterId,
      aggregateType: 'character',
      aggregateId: e.aggregate.id,
      visibility: 'owner',
      payload: e.payload,
      correlationId: e.correlationId,
      causationId: 'roll:1',
      traceparent: null,
    });
    expect(r.occurredAt).toEqual(new Date(e.occurredAt));
  });
});

describe('erreurs Postgres', () => {
  it('donnée invalide ou contrainte : définitive ; le reste : passagère', () => {
    const wrapped = (code: string) => Object.assign(new Error('Failed query'), { cause: { code } });
    expect(isPermanentDbError(wrapped('23514'))).toBe(true);
    expect(isPermanentDbError(wrapped('22P05'))).toBe(true);
    expect(isPermanentDbError(wrapped('57014'))).toBe(false);
    expect(isPermanentDbError(new Error('ECONNREFUSED'))).toBe(false);
    expect(dbErrorCode(wrapped('08006'))).toBe('08006');
  });
});

describe('partitions', () => {
  it('compte les mois bornes comprises', () => {
    expect(monthsBetween(new Date('2024-11-30T23:00:00Z'), new Date('2025-02-01T00:00:00Z'))).toBe(
      4,
    );
    expect(monthsBetween(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-30T12:00:00Z'))).toBe(
      1,
    );
  });
});

describe('filtre de types', () => {
  it('exacts ou par domaine, 20 au plus', () => {
    expect(Types.parse('character.hp_changed, legacy.*')).toEqual([
      'character.hp_changed',
      'legacy.*',
    ]);
    expect(Types.safeParse('Character.x').success).toBe(false);
    expect(Types.safeParse('legacy.%').success).toBe(false);
    expect(Types.safeParse(Array.from({ length: 21 }, (_, i) => `a.b${i}`).join(',')).success).toBe(
      false,
    );
  });
});
