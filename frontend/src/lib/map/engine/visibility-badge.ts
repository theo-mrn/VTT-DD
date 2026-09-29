/**
 * Badge de visibilité commun (vue du MJ) : œil barré sur fond neutre (caché aux joueurs),
 * inversé (invisible, MJ seul), œil ouvert sur fond doré (visible pour certains joueurs).
 * Dessiné en unités `u` (1 : pixels d'écran dans un conteneur à taille constante ; `1 / zoom`
 * dans le monde), centré en (x, y).
 */
import type { Graphics } from 'pixi.js';
import type { MapTheme } from './entities/entity-kind';

export type VisibilityBadge = 'hidden' | 'invisible' | 'custom';

/** Rayon du badge, en pixels d'écran. */
export const BADGE_RADIUS = 9;
/** Voile blanc posé sur un élément masqué aux joueurs (vue du MJ). */
export const HIDDEN_VEIL = { hidden: 0.34, invisible: 0.5 } as const;
export const WHITE = 0xffffff;

export function drawVisibilityBadge(
  g: Graphics,
  theme: MapTheme,
  badge: VisibilityBadge,
  x = 0,
  y = 0,
  u = 1,
) {
  const R = BADGE_RADIUS * u;
  const fill =
    badge === 'custom'
      ? theme.primary
      : badge === 'invisible'
        ? theme.foreground
        : theme.background;
  const ink = badge === 'hidden' ? theme.foreground : theme.background;
  // Ombre douce, puis la pastille
  g.circle(x + 0.6 * u, y + u, R + 0.5 * u).fill({ color: 0x000000, alpha: 0.3 });
  g.circle(x, y, R)
    .fill({ color: fill, alpha: 0.96 })
    .stroke({ width: u, color: badge === 'hidden' ? theme.muted : WHITE, alpha: 0.85 });
  // Œil
  g.moveTo(x - 5.4 * u, y)
    .quadraticCurveTo(x, y - 4.8 * u, x + 5.4 * u, y)
    .quadraticCurveTo(x, y + 4.8 * u, x - 5.4 * u, y)
    .stroke({ width: 1.4 * u, color: ink, join: 'round' });
  g.circle(x, y, 1.8 * u).fill({ color: ink });
  if (badge === 'custom') return;
  // Barré : un trait du fond coupe l'œil, puis le trait de l'encre
  g.moveTo(x - 4.6 * u, y + 4.4 * u)
    .lineTo(x + 4.6 * u, y - 4.4 * u)
    .stroke({ width: 3.4 * u, color: fill });
  g.moveTo(x - 4.6 * u, y + 4.4 * u)
    .lineTo(x + 4.6 * u, y - 4.4 * u)
    .stroke({ width: 1.4 * u, color: ink, cap: 'round' });
}
