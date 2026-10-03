/**
 * Panneaux déplaçables : le panneau reste dans la fenêtre (en entier horizontalement, l'en-tête
 * au moins verticalement), quel que soit le glisser.
 */
import { describe, expect, it } from 'vitest';
import { clampOffset } from './use-panel-drag';

const home = { left: 100, top: 80, width: 320, height: 600 };
const viewport = { width: 1280, height: 800 };

describe('panneau déplaçable', () => {
  it('un glisser dans la fenêtre est gardé tel quel', () => {
    expect(clampOffset({ x: 200, y: 50 }, home, viewport)).toEqual({ x: 200, y: 50 });
  });

  it('il ne sort ni à gauche ni à droite, et son en-tête reste visible en haut et en bas', () => {
    expect(clampOffset({ x: -500, y: -500 }, home, viewport)).toEqual({ x: -92, y: -72 });
    expect(clampOffset({ x: 5000, y: 5000 }, home, viewport)).toEqual({ x: 852, y: 656 });
  });

  it('un panneau plus large que la fenêtre se cale sur le bord gauche', () => {
    const wide = { ...home, width: 2000 };
    expect(clampOffset({ x: 300, y: 0 }, wide, viewport).x).toBe(-92);
  });
});
