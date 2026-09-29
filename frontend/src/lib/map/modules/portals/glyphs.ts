/**
 * Glyphes des portails (escalier, porte, portail, échelle) : de la donnée, dessinée une fois
 * en `GraphicsContext` partagé sur la carte (`view.ts`) et en SVG dans l'interface
 * (`components/map/portals/portal-glyph.tsx`) : le même dessin partout.
 *
 * Coordonnées dans une boîte de 16 × 16 centrée sur (0, 0), trait de 1,7.
 */
import type { MapPortalIcon } from '@vtt/contracts';
import type { GraphicsContext } from 'pixi.js';

export type GlyphPart =
  | { type: 'poly'; points: readonly number[]; fill: boolean; closed: boolean }
  | { type: 'circle'; x: number; y: number; r: number; fill: boolean }
  | { type: 'rect'; x: number; y: number; w: number; h: number; r: number };

export const GLYPH_STROKE = 1.7;
/** Demi-côté de la boîte des glyphes. */
export const GLYPH_HALF = 8;

/** Spirale du portail : deux tours, du centre vers le bord. */
function spiral(): number[] {
  const out: number[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 4.25 - Math.PI / 2;
    const r = 0.8 + 6.2 * t;
    out.push(Math.round(Math.cos(a) * r * 100) / 100, Math.round(Math.sin(a) * r * 100) / 100);
  }
  return out;
}

export const GLYPHS: Readonly<Record<MapPortalIcon, readonly GlyphPart[]>> = {
  // Silhouette de marches qui montent vers la droite
  stairs: [
    {
      type: 'poly',
      points: [-7, 7, -7, 3, -2.5, 3, -2.5, -1, 2, -1, 2, -5, 7, -5, 7, 7],
      fill: true,
      closed: true,
    },
  ],
  // Chambranle et poignée
  door: [
    { type: 'rect', x: -4.5, y: -7, w: 9, h: 14, r: 1 },
    { type: 'circle', x: 2, y: 0.5, r: 1.2, fill: true },
  ],
  portal: [{ type: 'poly', points: spiral(), fill: false, closed: false }],
  // Deux montants et quatre barreaux
  ladder: [
    { type: 'poly', points: [-3.5, -7.5, -3.5, 7.5], fill: false, closed: false },
    { type: 'poly', points: [3.5, -7.5, 3.5, 7.5], fill: false, closed: false },
    ...[-4.5, -1.5, 1.5, 4.5].map((y): GlyphPart => ({
      type: 'poly',
      points: [-3.5, y, 3.5, y],
      fill: false,
      closed: false,
    })),
  ],
};

/** Dessine le glyphe en blanc (teinté ensuite), à l'échelle `scale`. */
export function drawGlyph(ctx: GraphicsContext, icon: MapPortalIcon, scale = 1) {
  const stroke = {
    width: GLYPH_STROKE * scale,
    color: 0xffffff,
    cap: 'round' as const,
    join: 'round' as const,
  };
  for (const part of GLYPHS[icon] ?? GLYPHS.portal) {
    if (part.type === 'circle') {
      ctx.circle(part.x * scale, part.y * scale, part.r * scale);
      if (part.fill) ctx.fill({ color: 0xffffff });
      else ctx.stroke(stroke);
    } else if (part.type === 'rect') {
      ctx
        .roundRect(part.x * scale, part.y * scale, part.w * scale, part.h * scale, part.r * scale)
        .stroke(stroke);
    } else {
      const pts = part.points.map((v) => v * scale);
      if (part.fill) ctx.poly(pts, true).fill({ color: 0xffffff });
      else {
        ctx.moveTo(pts[0]!, pts[1]!);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
        if (part.closed) ctx.closePath();
        ctx.stroke(stroke);
      }
    }
  }
}
