import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ChannelCommand,
  CreateAsset,
  importedAssetId,
  MixerPreferences,
  nextIndex,
  normalizeSourceUrl,
  parseYoutubeId,
  positionAt,
  uuidv5,
} from './audio.js';

const T0 = Date.parse('2026-09-28T10:00:00.000Z');
const state = (over: Partial<Parameters<typeof positionAt>[0]> = {}) => ({
  status: 'playing' as const,
  positionMs: 1_000,
  anchorAt: new Date(T0).toISOString(),
  repeat: 'all' as const,
  track: { durationMs: 10_000 },
  ...over,
});

describe('positionAt', () => {
  it('arrêt et pause : la position enregistrée', () => {
    expect(positionAt(state({ status: 'stopped', positionMs: 0 }), T0 + 5_000)).toEqual({
      positionMs: 0,
      ended: false,
    });
    expect(positionAt(state({ status: 'paused' }), T0 + 5_000)).toEqual({
      positionMs: 1_000,
      ended: false,
    });
  });

  it('lecture : position + temps écoulé depuis l’ancre, jamais avant l’ancre', () => {
    expect(positionAt(state(), T0 + 2_500).positionMs).toBe(3_500);
    expect(positionAt(state(), T0 - 500).positionMs).toBe(1_000);
  });

  it('boucle de piste : modulo la durée', () => {
    expect(positionAt(state({ repeat: 'track' }), T0 + 12_000)).toEqual({
      positionMs: 3_000,
      ended: false,
    });
  });

  it('fin de piste', () => {
    expect(positionAt(state(), T0 + 9_000)).toEqual({ positionMs: 10_000, ended: true });
  });

  it('durée inconnue (YouTube) : jamais finie', () => {
    expect(positionAt(state({ track: { durationMs: null } }), T0 + 99_000)).toEqual({
      positionMs: 100_000,
      ended: false,
    });
  });
});

describe('nextIndex', () => {
  it('off, all, track, une piste, vide', () => {
    expect(nextIndex(3, 0, 'off')).toBe(1);
    expect(nextIndex(3, 2, 'off')).toBeNull();
    expect(nextIndex(3, 2, 'all')).toBe(0);
    expect(nextIndex(3, 1, 'track')).toBe(1);
    expect(nextIndex(1, 0, 'all')).toBe(0);
    expect(nextIndex(1, 0, 'off')).toBeNull();
    expect(nextIndex(0, 0, 'all')).toBeNull();
  });
});

describe('uuidv5 et importedAssetId', () => {
  it('vecteur de la RFC (espace DNS)', () => {
    expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  it('identique au SHA-1 de Node, y compris en UTF-8 et au-delà d’un bloc', () => {
    const node = (name: string, ns: string) => {
      const b = createHash('sha1')
        .update(Buffer.concat([Buffer.from(ns.replace(/-/g, ''), 'hex'), Buffer.from(name)]))
        .digest()
        .subarray(0, 16);
      b[6] = (b[6]! & 0x0f) | 0x50;
      b[8] = (b[8]! & 0x3f) | 0x80;
      const h = b.toString('hex');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    };
    const ns = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
    for (const name of ['', 'é', 'x'.repeat(55), 'x'.repeat(56), 'Forêt de nuit '.repeat(20)])
      expect(uuidv5(name, ns)).toBe(node(name, ns));
  });

  it('stable, sensible à la campagne, insensible à la casse de l’id', () => {
    const c = '0199a0c3-0000-7000-8000-000000000001';
    const a = importedAssetId(c, 'youtube:dQw4w9WgXcQ');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(importedAssetId(c.toUpperCase(), 'youtube:dQw4w9WgXcQ')).toBe(a);
    expect(importedAssetId('0199a0c3-0000-7000-8000-000000000002', 'youtube:dQw4w9WgXcQ')).not.toBe(
      a,
    );
  });

  it('URL avec espaces : même id qu’encodée', () => {
    const c = '0199a0c3-0000-7000-8000-000000000001';
    const brute = normalizeSourceUrl('https://assets.yner.fr/Audio/Foret de_nuit.mp3');
    expect(brute).toBe('https://assets.yner.fr/Audio/Foret%20de_nuit.mp3');
    expect(normalizeSourceUrl('https://assets.yner.fr/Audio/Foret%20de_nuit.mp3')).toBe(brute);
    expect(normalizeSourceUrl(' /Musics/chill/M1.mp3 ')).toBe(
      'https://assets.yner.fr/Musics/chill/M1.mp3',
    );
    expect(importedAssetId(c, brute)).toBe(
      importedAssetId(c, normalizeSourceUrl('https://assets.yner.fr/Audio/Foret de_nuit.mp3')),
    );
  });
});

describe('parseYoutubeId', () => {
  it('liens usuels, id brut, tabulation, invalides', () => {
    for (const s of [
      'dQw4w9WgXcQ',
      'dQw4w9WgXcQ\t',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    ])
      expect(parseYoutubeId(s), s).toBe('dQw4w9WgXcQ');
    for (const s of ['', 'abc', 'https://vimeo.com/123', 'https://youtube.com/watch?v=court'])
      expect(parseYoutubeId(s), s).toBeNull();
  });
});

describe('schémas', () => {
  it('commande play et configure', () => {
    expect(ChannelCommand.parse({ type: 'play', assetId: crypto.randomUUID() }).type).toBe('play');
    expect(() => ChannelCommand.parse({ type: 'configure', crossfadeMs: 20_000 })).toThrow();
    expect(() => ChannelCommand.parse({ type: 'dance' })).toThrow();
  });

  it('création d’asset : trois sources', () => {
    expect(CreateAsset.parse({ source: 'youtube', url: 'dQw4w9WgXcQ', name: 'A' }).source).toBe(
      'youtube',
    );
    expect(() => CreateAsset.parse({ source: 'upload', name: 'A', kind: 'music' })).toThrow();
  });

  it('mixeur : tous les bus', () => {
    expect(() =>
      MixerPreferences.parse({ volumes: { master: 1 }, muted: {}, version: 1 }),
    ).toThrow();
  });
});
