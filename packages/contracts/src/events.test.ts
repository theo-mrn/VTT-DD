import { describe, expect, it } from 'vitest';
import { EventEnvelope, subjectFor } from './events.js';

const base = {
  id: '01929b2e-7a3c-7cc1-9c1e-6f2c1a4b5d6e',
  type: 'character.hp_changed',
  version: 1,
  occurredAt: '2026-09-25T14:21:00Z',
  roomId: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90',
  actor: { userId: '8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f', role: 'gm' },
  aggregate: { type: 'character', id: 'abc' },
  payload: { before: { hp: 24 }, after: { hp: 17 } },
  correlationId: 'req-1',
};

describe('EventEnvelope', () => {
  it('applique les valeurs par défaut', () => {
    const e = EventEnvelope.parse(base);
    expect(e.visibility).toBe('public');
    expect(e.actor.characterId).toBeNull();
    expect(e.traceparent).toBeNull();
  });

  it('refuse un type mal formé', () => {
    expect(() => EventEnvelope.parse({ ...base, type: 'Character.HpChanged' })).toThrow();
  });

  it('refuse une date sans fuseau', () => {
    expect(() => EventEnvelope.parse({ ...base, occurredAt: '2026-09-25 14:21' })).toThrow();
  });
});

describe('subjectFor', () => {
  it('construit le sujet NATS', () => {
    expect(subjectFor({ type: 'character.hp_changed', roomId: 'r1' })).toBe(
      'vtt.r1.character.hp_changed',
    );
    expect(subjectFor({ type: 'billing.invoice_paid', roomId: null })).toBe(
      'vtt.global.billing.invoice_paid',
    );
  });
});
