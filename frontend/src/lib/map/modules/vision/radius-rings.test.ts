/**
 * Rayons de vision : liseré doux autour de chaque observateur, redessiné seulement
 * quand les observateurs, le zoom ou la préférence changent.
 */
import { describe, expect, it } from 'vitest';
import { featherRings, VisionRings } from './radius-rings';
import type { VisionPicture } from './vision-state';

class FakeGraphics {
  circles: number[][] = [];
  strokes = 0;
  clears = 0;
  constructor(readonly o: { label: string }) {}
  clear() {
    this.clears++;
    this.circles = [];
    return this;
  }
  circle(x: number, y: number, r: number) {
    this.circles.push([x, y, r]);
    return this;
  }
  stroke() {
    this.strokes++;
    return this;
  }
  removeFromParent() {}
  destroy() {}
}

const theme = { primary: 1, foreground: 2, background: 3, muted: 4, destructive: 5, success: 6 };
const picture = (radius: number, version: number) =>
  ({
    viewers: [{ id: 'heros', pos: { x: 100, y: 50 }, terms: { visionRadius: radius } }],
    versions: { fog: 0, lights: 0, viewers: version },
  }) as unknown as VisionPicture;

function rings() {
  let gfx: FakeGraphics | null = null;
  const pixi = {
    Graphics: class extends FakeGraphics {
      constructor(o: { label: string }) {
        super(o);
        gfx = this;
      }
    },
  };
  const plane = { addChild: () => undefined };
  const r = new VisionRings(pixi as never, plane as never, theme);
  return { r, gfx: () => gfx! };
}

describe('rayons de vision', () => {
  it('liseré : opacité décroissante du bord vers l’intérieur, jamais un trait marqué', () => {
    const rings = featherRings();
    expect(rings[0]!.alpha).toBeLessThanOrEqual(0.2);
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i]!.alpha).toBeLessThan(rings[i - 1]!.alpha);
      expect(rings[i]!.insetPx).toBeGreaterThan(rings[i - 1]!.insetPx);
    }
  });

  it('un cercle par observateur, au rayon de vision ; rien si la préférence est coupée', () => {
    const { r, gfx } = rings();
    const p = picture(150, 1);
    expect(r.draw(p, 1, true)).toBe(true);
    const circles = gfx().circles;
    expect(circles.length).toBe(featherRings().length);
    expect(circles.every(([x, y]) => x === 100 && y === 50)).toBe(true);
    // Juste à l'intérieur du rayon, jamais au-delà
    expect(circles.every(([, , rad]) => rad! < 150 && rad! > 135)).toBe(true);
    // Rien n'a changé : pas de nouveau dessin
    expect(r.draw(p, 1, true)).toBe(false);
    // Préférence coupée : effacé
    expect(r.draw(p, 1, false)).toBe(true);
    expect(gfx().circles).toEqual([]);
    // L'observateur bouge (nouvelle version) : redessiné
    expect(r.draw(picture(150, 2), 1, true)).toBe(true);
  });
});
