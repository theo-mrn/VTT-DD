import { describe, expect, it } from 'vitest';
import { normaliser } from './normaliser.js';

// Imitations des types Firestore (même forme que firebase-admin)
const timestamp = (seconds: number, nanoseconds: number) => ({
  seconds,
  nanoseconds,
  toDate: () => new Date(seconds * 1000 + nanoseconds / 1e6),
});
const reference = (path: string) => ({ path, firestore: {}, id: path.split('/').pop() });
class GeoPoint {
  constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {}
}

describe('normaliser', () => {
  it('garde les valeurs JSON telles quelles', () => {
    expect(normaliser({ a: 1, b: 'x', c: true, d: null, e: [1, 'deux'] })).toEqual({
      a: 1,
      b: 'x',
      c: true,
      d: null,
      e: [1, 'deux'],
    });
  });

  it('balise les Timestamp en conservant les nanosecondes', () => {
    expect(normaliser(timestamp(1_758_810_060, 123_456_789))).toEqual({
      $timestamp: '2025-09-25T14:21:00.123456789Z',
    });
  });

  it('balise les références, GeoPoint et octets', () => {
    expect(normaliser(reference('cartes/r1/characters/c1'))).toEqual({
      $ref: 'cartes/r1/characters/c1',
    });
    expect(normaliser(new GeoPoint(48.85, 2.35))).toEqual({ $geo: [48.85, 2.35] });
    expect(normaliser(Buffer.from('salut'))).toEqual({ $bytes: 'c2FsdXQ=' });
  });

  it('descend dans les objets et tableaux imbriqués', () => {
    expect(
      normaliser({ fiche: { creeLe: timestamp(0, 0), liens: [reference('users/u1')] } }),
    ).toEqual({
      fiche: {
        creeLe: { $timestamp: '1970-01-01T00:00:00.000000000Z' },
        liens: [{ $ref: 'users/u1' }],
      },
    });
  });

  it('ne confond jamais une clé d’origine commençant par $ avec une balise', () => {
    expect(normaliser({ $timestamp: 'pas une balise' })).toEqual({ $$timestamp: 'pas une balise' });
  });

  it('ne transforme pas NaN ou Infinity en null', () => {
    expect(normaliser({ pv: Number.NaN, max: Infinity })).toEqual({
      pv: { $number: 'NaN' },
      max: { $number: 'Infinity' },
    });
  });

  it('laisse un simple objet { latitude, longitude } tel quel', () => {
    expect(normaliser({ latitude: 1, longitude: 2 })).toEqual({ latitude: 1, longitude: 2 });
  });

  it('convertit undefined en null', () => {
    expect(normaliser({ a: undefined })).toEqual({ a: null });
  });
});
