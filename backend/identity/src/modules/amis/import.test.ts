import { describe, expect, it } from 'vitest';
import { dateFirestore, lienDepuisChemin } from './import.js';
import { paire } from './service.js';

describe('import des amis Firebase (transformation)', () => {
  it('interprète les chemins de useFriends', () => {
    expect(lienDepuisChemin('friendships/u1/friends/u2')).toEqual({
      type: 'amitie',
      uid: 'u1',
      autreUid: 'u2',
    });
    expect(lienDepuisChemin('requests/u1/received/u2')).toEqual({
      type: 'demande',
      deUid: 'u2',
      versUid: 'u1',
    });
    expect(lienDepuisChemin('requests/u1/sent/u2')).toEqual({
      type: 'demande',
      deUid: 'u1',
      versUid: 'u2',
    });
  });

  it('rejette les chemins inconnus ou incomplets', () => {
    expect(lienDepuisChemin('friendships/u1')).toBeNull();
    expect(lienDepuisChemin('requests/u1/autre/u2')).toBeNull();
    expect(lienDepuisChemin('users/u1/friends/u2')).toBeNull();
    expect(lienDepuisChemin('friendships//friends/u2')).toBeNull();
  });

  it('lit les horodatages balisés de l’export', () => {
    expect(dateFirestore({ $timestamp: '2025-01-02T03:04:05.123456789Z' })?.toISOString()).toBe(
      '2025-01-02T03:04:05.123Z',
    );
    expect(dateFirestore('2025-01-02T03:04:05Z')?.getTime()).toBe(Date.UTC(2025, 0, 2, 3, 4, 5));
    expect(dateFirestore({ $timestamp: 'n’importe quoi' })).toBeNull();
    expect(dateFirestore(undefined)).toBeNull();
  });

  it('ordonne la paire comme PostgreSQL, quel que soit le sens', () => {
    const a = '0190a000-0000-7000-8000-000000000001';
    const b = '0190A000-0000-7000-8000-00000000000F';
    expect(paire(a, b)).toEqual({ userA: a, userB: b.toLowerCase() });
    expect(paire(b, a)).toEqual({ userA: a, userB: b.toLowerCase() });
  });
});
