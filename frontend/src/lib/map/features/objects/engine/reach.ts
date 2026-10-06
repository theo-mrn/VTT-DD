/**
 * Portée de la fouille (docs/carte.md § 10 et § 12, point 6), au calcul près celle du serveur
 * (`backend/campaign/src/modules/maps/objects.ts`) :
 *
 *   ST_Distance(token.pos, ST_Rotate(enveloppe de l'objet, radians(rotation), centre))
 *     ≤ searchRadius × pixelsPerUnit
 *
 * - l'objet est son rectangle `pos` (coin haut gauche) × `width` × `height`, tourné de
 *   `rotation` degrés autour de son centre, dans le sens de l'écran (`ST_Rotate` applique
 *   x' = x cos − y sin, y' = x sin + y cos : c'est `rotateAround`) ;
 * - la distance part de `pos` du token (son centre) ; elle est nulle dedans ;
 * - seuls comptent les tokens des personnages de l'utilisateur présents sur cette carte.
 *
 * Du calcul pur, sans Pixi ni DOM.
 */
import { toLocal, type EntityGeometry, type Point } from '@/lib/map/engine/geometry';

export interface ObjectShape {
  pos: Point;
  width: number;
  height: number;
  rotation: number;
}

/** Géométrie (centre, taille, rotation) d'un objet de carte. */
export function objectGeometry(o: ObjectShape): EntityGeometry {
  return {
    x: o.pos.x + o.width / 2,
    y: o.pos.y + o.height / 2,
    width: o.width,
    height: o.height,
    rotation: o.rotation || 0,
  };
}

/** Distance d'un point au rectangle tourné (0 dedans ou sur le bord). */
export function distanceToRotatedRect(p: Point, g: EntityGeometry): number {
  const l = toLocal(g, p);
  const dx = Math.max(Math.abs(l.x) - g.width / 2, 0);
  const dy = Math.max(Math.abs(l.y) - g.height / 2, 0);
  return Math.hypot(dx, dy);
}

/** Portée en pixels du monde (`searchRadius` unités × `pixelsPerUnit`). */
export const reachPixels = (searchRadius: number, pixelsPerUnit: number) =>
  Math.max(0, searchRadius) * pixelsPerUnit;

export interface TokenLike {
  characterId?: unknown;
  pos?: unknown;
  [field: string]: unknown;
}

export interface CharacterReach {
  characterId: string;
  /** Distance au rectangle, en pixels du monde. */
  distance: number;
  inRange: boolean;
}

const isPoint = (p: unknown): p is Point =>
  typeof p === 'object' &&
  p !== null &&
  Number.isFinite((p as Point).x) &&
  Number.isFinite((p as Point).y);

/**
 * Pour chacun de ces personnages qui a un token sur la carte : sa distance à l'objet et s'il
 * est à portée. Triés : à portée d'abord, puis du plus proche au plus loin.
 */
export function charactersReach(
  object: ObjectShape & { searchRadius?: number },
  tokens: Iterable<TokenLike>,
  characterIds: readonly string[],
  pixelsPerUnit: number,
): CharacterReach[] {
  const mine = new Set(characterIds);
  const g = objectGeometry(object);
  const limit = reachPixels(object.searchRadius ?? 0, pixelsPerUnit);
  const best = new Map<string, number>();
  for (const t of tokens) {
    const id = typeof t.characterId === 'string' ? t.characterId : null;
    if (!id || !mine.has(id) || !isPoint(t.pos)) continue;
    const d = distanceToRotatedRect(t.pos, g);
    if (d < (best.get(id) ?? Infinity)) best.set(id, d);
  }
  return [...best]
    .map(([characterId, distance]) => ({ characterId, distance, inRange: distance <= limit }))
    .sort((a, b) => Number(b.inRange) - Number(a.inRange) || a.distance - b.distance);
}

/**
 * Personnage proposé pour fouiller : celui que l'utilisateur incarne (premier de ses
 * personnages) s'il est à portée, sinon le plus proche à portée ; null si aucun.
 */
export function preferredSearcher(
  reach: readonly CharacterReach[],
  characterIds: readonly string[],
): string | null {
  const inRange = reach.filter((r) => r.inRange);
  if (!inRange.length) return null;
  const played = characterIds[0];
  return inRange.find((r) => r.characterId === played)?.characterId ?? inRange[0]!.characterId;
}
