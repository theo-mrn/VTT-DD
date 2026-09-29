/**
 * Badge de visibilité : œil barré pour un élément caché ou invisible, œil ouvert pour « visible
 * pour certains joueurs », à la taille demandée.
 */
import { describe, expect, it } from 'vitest';
import { BADGE_RADIUS, drawVisibilityBadge } from './visibility-badge';

class FakeGraphics {
  circles: number[][] = [];
  lines = 0;
  fills: number[] = [];
  circle(x: number, y: number, r: number) {
    this.circles.push([x, y, r]);
    return this;
  }
  moveTo() {
    return this;
  }
  lineTo() {
    this.lines++;
    return this;
  }
  quadraticCurveTo() {
    return this;
  }
  fill(o: { color: number }) {
    this.fills.push(o.color);
    return this;
  }
  stroke() {
    return this;
  }
}

const theme = { primary: 1, foreground: 2, background: 3, muted: 4, destructive: 5, success: 6 };

describe('badge de visibilité', () => {
  it('caché : œil barré sur fond neutre ; visible pour certains : œil ouvert doré', () => {
    const hidden = new FakeGraphics();
    drawVisibilityBadge(hidden as never, theme, 'hidden');
    expect(hidden.lines).toBe(2);
    expect(hidden.fills).toContain(theme.background);
    const custom = new FakeGraphics();
    drawVisibilityBadge(custom as never, theme, 'custom');
    expect(custom.lines).toBe(0);
    expect(custom.fills).toContain(theme.primary);
    const invisible = new FakeGraphics();
    drawVisibilityBadge(invisible as never, theme, 'invisible');
    expect(invisible.fills).toContain(theme.foreground);
  });

  it('à la taille et à la place demandées (unité 1 / zoom dans le monde)', () => {
    const g = new FakeGraphics();
    drawVisibilityBadge(g as never, theme, 'hidden', 100, 50, 0.5);
    expect(g.circles).toContainEqual([100, 50, BADGE_RADIUS * 0.5]);
  });
});
