/**
 * Distances affichées (docs/carte.md § 4) : les portées sont stockées en cases ; à l'écran, une
 * distance vaut cases × distance par case (`unitsPerCell`), suivie de l'unité (« 4,5 m »). Une
 * valeur saisie dans l'unité se reconvertit en cases (`scale` des champs numériques).
 */
import { activeLocale } from '@/i18n/runtime';
import type { MapScale } from '@vtt/contracts';

export type DistanceScale = MapScale;

/** Distance d'un nombre de cases, dans l'unité de la scène. */
export const distanceOf = (cells: number, s: DistanceScale) => cells * s.unitsPerCell;

/** « 4,5 m » : cases × distance par case, au dixième. */
export function formatDistance(cells: number, s: DistanceScale, digits = 1): string {
  const v = distanceOf(cells, s);
  return `${v.toLocaleString(activeLocale(), { maximumFractionDigits: digits })} ${s.unitName}`;
}

/** Aire de `cells²` cases, dans l'unité de la scène (« 20 m² »). */
export function formatAreaOf(cells2: number, s: DistanceScale): string {
  const v = cells2 * s.unitsPerCell * s.unitsPerCell;
  return `${v.toLocaleString(activeLocale(), { maximumFractionDigits: v >= 10 ? 0 : 1 })} ${s.unitName}²`;
}
