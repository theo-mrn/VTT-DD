/**
 * Ce qu'on entend sur la carte (docs/carte.md § 10, Zones sonores) : l'auditeur et les murs entre
 * lui et chaque zone. Sans React ; le composant `MapSounds` le passe au moteur audio
 * (`useSpatialAudio`).
 */
import { isGm } from '../../engine/entities/entity-kind';
import type { Point } from '../../engine/geometry';
import type { MapEngine } from '../../engine/map-engine';
import type { MapDto } from '../../store/map-store';
import { TOKEN_KIND } from './model';

/**
 * Segments qui arrêtent le son, `[ax, ay, bx, by, …]` : murs, murs à sens unique (translucides
 * compris), portes fermées. Ni fenêtre ni porte ouverte.
 */
export function soundWalls(obstacles: Iterable<MapDto>): Float64Array {
  const out: number[] = [];
  for (const o of obstacles) {
    if (o.kind === 'window' || (o.kind === 'door' && o.isOpen === true)) continue;
    const pts = Array.isArray(o.points) ? (o.points as { x: number; y: number }[]) : [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      out.push(a.x, a.y, b.x, b.y);
    }
  }
  return Float64Array.from(out);
}

/** Nombre de segments que coupe la droite `a → b` (extrémités du mur comprises). */
export function wallsBetween(a: Point, b: Point, walls: Float64Array): number {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  let n = 0;
  for (let i = 0; i < walls.length; i += 4) {
    const px = walls[i]!;
    const py = walls[i + 1]!;
    const sx = walls[i + 2]! - px;
    const sy = walls[i + 3]! - py;
    const den = rx * sy - ry * sx;
    if (den === 0) continue; // parallèles : le son longe le mur
    const qx = px - a.x;
    const qy = py - a.y;
    const t = (qx * sy - qy * sx) / den;
    const u = (qx * ry - qy * rx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) n += 1;
  }
  return n;
}

/**
 * Qui écoute : mon token sélectionné, sinon celui du personnage que j'incarne (en tête de
 * `viewer.characterIds`), sinon mon premier token de la scène. Position affichée (glisser
 * compris). MJ et spectateur : personne.
 */
export function listenerOf(engine: MapEngine): Point | null {
  const viewer = engine.viewer;
  if (isGm(viewer) || viewer.role !== 'player' || !viewer.characterIds.length) return null;
  const mine = engine
    .entitiesOfKind(TOKEN_KIND)
    .filter((t) => viewer.characterIds.includes((t.data as MapDto).characterId as string));
  if (!mine.length) return null;
  const rank = (characterId: unknown) => {
    const i = viewer.characterIds.indexOf(characterId as string);
    return i < 0 ? Infinity : i;
  };
  const chosen =
    mine.find((t) => engine.selection.has(t.id)) ??
    [...mine].sort((p, q) => rank(p.data.characterId) - rank(q.data.characterId))[0]!;
  return { x: chosen.current.x, y: chosen.current.y };
}
