import { describe, expect, it } from 'vitest';
import {
  ATTACK_MEMORY_KEY,
  ATTACK_MEMORY_MAX,
  recallAttack,
  rememberAttack,
  type MemoryStorage,
} from './attack-flow-memory';

function fakeStorage(initial: Record<string, string> = {}): MemoryStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('dernière attaque de chaque personnage', () => {
  it('garde l’action et ses paramètres, par campagne et par personnage', () => {
    const st = fakeStorage();
    rememberAttack(st, 'c1', 'hero', { actionId: 'frappe', params: { arme: 'arc' } }, 10);
    expect(recallAttack(st, 'c1', 'hero')).toEqual({
      actionId: 'frappe',
      params: { arme: 'arc' },
      at: 10,
    });
    expect(recallAttack(st, 'c2', 'hero')).toBeNull();
    expect(recallAttack(st, 'c1', 'gobelin')).toBeNull();
    expect(recallAttack(st, 'c1', null)).toBeNull();
  });

  it('stockage absent, illisible ou refusé : on s’en passe', () => {
    expect(recallAttack(null, 'c1', 'hero')).toBeNull();
    expect(() => rememberAttack(null, 'c1', 'hero', { actionId: 'a', params: {} })).not.toThrow();
    expect(recallAttack(fakeStorage({ [ATTACK_MEMORY_KEY]: '{oups' }), 'c1', 'hero')).toBeNull();
    const full: MemoryStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(() => rememberAttack(full, 'c1', 'hero', { actionId: 'a', params: {} })).not.toThrow();
    // Entrée abîmée : ignorée
    const bad = fakeStorage({
      [ATTACK_MEMORY_KEY]: JSON.stringify({ 'c1:hero': { actionId: 'a', params: { x: {} } } }),
    });
    expect(recallAttack(bad, 'c1', 'hero')).toBeNull();
  });

  it('ne garde que les plus récents', () => {
    const st = fakeStorage();
    for (let i = 0; i < ATTACK_MEMORY_MAX + 5; i++)
      rememberAttack(st, 'c', `p${i}`, { actionId: 'a', params: {} }, i);
    const book = JSON.parse(st.data[ATTACK_MEMORY_KEY]!) as Record<string, unknown>;
    expect(Object.keys(book)).toHaveLength(ATTACK_MEMORY_MAX);
    expect(recallAttack(st, 'c', 'p0')).toBeNull();
    expect(recallAttack(st, 'c', `p${ATTACK_MEMORY_MAX + 4}`)).not.toBeNull();
  });
});
