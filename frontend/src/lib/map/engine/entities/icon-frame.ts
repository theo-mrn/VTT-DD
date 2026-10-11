/**
 * Cadre des icônes de la carte (lumières, zones sonores) : pastille de fond et sa version
 * sélectionnée (anneau de la couleur principale), aux couleurs du thème. Le symbole de chaque
 * fonction se dessine par-dessus.
 */
import type { GraphicsContext } from 'pixi.js';
import type { MapTheme } from './entity-kind';

export function iconFrame(
  make: (draw: (c: GraphicsContext, t: MapTheme) => void) => GraphicsContext,
  radius: number,
): { base: GraphicsContext; selected: GraphicsContext } {
  return {
    base: make((c, t) =>
      c
        .circle(0, 0, radius)
        .fill({ color: t.background, alpha: 0.9 })
        .stroke({ width: 1.5, color: t.muted }),
    ),
    selected: make((c, t) =>
      c
        .circle(0, 0, radius + 3)
        .stroke({ width: 2, color: t.primary })
        .circle(0, 0, radius)
        .fill({ color: t.background, alpha: 0.9 })
        .stroke({ width: 1.5, color: t.primary }),
    ),
  };
}
