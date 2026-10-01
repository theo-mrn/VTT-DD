import { describe, expect, it } from 'vitest';
import { isUploadKey, sweepOrphans } from './orphans.js';
import { memoryObjectStore } from './storage.js';

const id = () => crypto.randomUUID();
const HOUR = 3_600_000;

describe('fichiers orphelins', () => {
  it('seules nos clés d’envoi sont candidates', () => {
    expect(isUploadKey(`characters/${id()}/${id()}.webp`)).toBe(true);
    expect(isUploadKey(`campaigns/${id()}/${id()}.mp4`)).toBe(true);
    expect(isUploadKey(`characters/${id()}/portrait.webp`)).toBe(false);
    expect(isUploadKey(`legacy/${id()}/${id()}.webp`)).toBe(false);
    expect(isUploadKey(`characters/${id()}/${id()}.webp.bak`)).toBe(false);
    expect(isUploadKey(`characters/${id().toUpperCase()}/${id()}.webp`)).toBe(false);
  });

  it('supprime les orphelins anciens, garde le référencé, le récent et l’étranger', async () => {
    const now = Date.now();
    const old = new Date(now - 48 * HOUR);
    const owner = id();
    const keys = {
      used: `characters/${owner}/${id()}.webp`,
      orphan: `characters/${owner}/${id()}.webp`,
      young: `characters/${owner}/${id()}.webp`,
      foreign: `characters/${owner}/ancien-portrait.png`,
      elsewhere: `avatars/${id()}/${id()}.webp`,
    };
    const { store, objects } = memoryObjectStore({
      [keys.used]: old,
      [keys.orphan]: old,
      [keys.young]: new Date(now - HOUR),
      [keys.foreign]: old,
      [keys.elsewhere]: old,
    });
    const checkers = [
      async () => [] as string[],
      async (k: readonly string[]) => k.filter((x) => x === keys.used),
    ];
    const base = { store, prefixes: ['characters/'], checkers, minAgeMs: 24 * HOUR, now };

    const essai = await sweepOrphans({ ...base, dryRun: true });
    expect(essai).toMatchObject({
      seen: 4,
      foreign: 1,
      young: 1,
      referenced: 1,
      orphans: 1,
      removed: 0,
    });
    expect(essai.sample).toEqual([keys.orphan]);
    expect(objects.size).toBe(5);

    const vrai = await sweepOrphans({ ...base, dryRun: false });
    expect(vrai.removed).toBe(1);
    expect([...objects.keys()].sort()).toEqual(
      [keys.used, keys.young, keys.foreign, keys.elsewhere].sort(),
    );
  });

  it('un service qui ne répond pas : rien supprimé', async () => {
    const { store, objects } = memoryObjectStore({
      [`characters/${id()}/${id()}.webp`]: new Date(0),
    });
    await expect(
      sweepOrphans({
        store,
        prefixes: ['characters/'],
        checkers: [async () => [], async () => Promise.reject(new Error('injoignable'))],
        minAgeMs: HOUR,
        dryRun: false,
      }),
    ).rejects.toThrow('injoignable');
    expect(objects.size).toBe(1);
  });
});
