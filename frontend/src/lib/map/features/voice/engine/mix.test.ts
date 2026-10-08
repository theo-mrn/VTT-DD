import { DEFAULT_MAP_VOICE } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';

import { proximityGain, voiceMixes } from './mix';

const PROXIMITY = { ...DEFAULT_MAP_VOICE, mode: 'proximity' as const };
const NO_WALLS = new Float64Array();

describe('voix de proximité', () => {
  it('plein volume jusqu’à la portée claire, silence à la portée maximale', () => {
    expect(proximityGain(0, 6, 24)).toBe(1);
    expect(proximityGain(6, 6, 24)).toBe(1);
    expect(proximityGain(15, 6, 24)).toBeCloseTo(0.75);
    expect(proximityGain(24, 6, 24)).toBe(0);
    expect(proximityGain(40, 6, 24)).toBe(0);
  });

  it('mode Table : aucune entrée (comme un appel)', () => {
    const mixes = voiceMixes({
      voice: DEFAULT_MAP_VOICE,
      listener: { x: 0, y: 0 },
      pixelsPerCell: 50,
      walls: NO_WALLS,
      speakers: [{ userId: 'a', at: { x: 5_000, y: 0 } }],
    });
    expect(mixes.size).toBe(0);
  });

  it('distance en cases, position gauche-droite, orateur sans token entendu partout', () => {
    const mixes = voiceMixes({
      voice: PROXIMITY,
      listener: { x: 0, y: 0 },
      pixelsPerCell: 50,
      walls: NO_WALLS,
      speakers: [
        { userId: 'proche', at: { x: 100, y: 0 } },
        { userId: 'gauche', at: { x: -750, y: 0 } },
        { userId: 'loin', at: { x: 50 * 30, y: 0 } },
        { userId: 'mj', at: null },
      ],
    });
    expect(mixes.get('proche')).toMatchObject({ gain: 1 });
    expect(mixes.get('proche')!.pan).toBeGreaterThan(0);
    expect(mixes.get('gauche')!.gain).toBeCloseTo(0.75);
    expect(mixes.get('gauche')!.pan).toBeLessThan(0);
    expect(mixes.get('loin')!.gain).toBe(0);
    expect(mixes.has('mj')).toBe(false);
  });

  it('chaque mur divise le volume par deux et étouffe la voix', () => {
    // Un mur vertical entre l'auditeur (0,0) et l'orateur (100,0)
    const walls = Float64Array.from([50, -100, 50, 100]);
    const mix = voiceMixes({
      voice: PROXIMITY,
      listener: { x: 0, y: 0 },
      pixelsPerCell: 50,
      walls,
      speakers: [{ userId: 'a', at: { x: 100, y: 0 } }],
    }).get('a')!;
    expect(mix.gain).toBeCloseTo(0.5);
    expect(mix.cutoffHz).toBeLessThan(5_000);
  });

  it('sans auditeur (spectateur, joueur sans token) : comme un appel', () => {
    const mixes = voiceMixes({
      voice: PROXIMITY,
      listener: null,
      pixelsPerCell: 50,
      walls: NO_WALLS,
      speakers: [{ userId: 'a', at: { x: 100, y: 0 } }],
    });
    expect(mixes.size).toBe(0);
  });
});
