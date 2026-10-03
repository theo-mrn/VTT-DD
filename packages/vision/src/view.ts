/**
 * Ce qu'un observateur voit (docs/carte.md § 9), sans aucune opération booléenne de polygones :
 *
 * ```
 * LOS(O)  = polygone de vue depuis O (murs opaques, portes fermées, sens unique vu depuis O)
 * Pièce   = LOS(O) ∩ R − (pièces fermées qui ne contiennent pas O)
 *           où R est la pièce fermée la plus intérieure contenant O (sans R : pas d'intersection)
 * Portée  = (hors brouillard) ∪ disque(O, visionRadius) ∪ (⋃ lumières : disque(L) ∩ LOS(L))
 * Vu(O)   = Pièce ∩ Portée ;  Vu(joueur) = ⋃ Vu(O)
 * ```
 *
 * `View.contains(p)` combine des tests ponctuels : disque, zones de brouillard (grille), lumières
 * (grille, disque puis polygone étoilé en O(log n)), pièces fermées (grille, polygone), et enfin
 * le polygone de vue (O(log n)). Les termes sont exposés pour que le rendu GPU compose
 * exactement la même chose (masques et `ERASE`).
 */
import { clipStarToDisc } from './disc.js';
import {
  closedRoomsAt,
  inFogXY,
  innermostRoomIndex,
  isLitXY,
  lightStar,
  type PreparedLight,
  type PreparedScene,
} from './prepare.js';
import { computeStar, type StarPolygon, starContains } from './sweep.js';
import type { Light, Polygon, Vec, Viewer } from './types.js';

/** Pièce utilisée par une vue : son id et son contour à plat. */
export interface RoomTerm {
  readonly id: string;
  /** Contour à plat (partagé avec la scène préparée : ne pas modifier). */
  readonly polygon: Polygon;
}

/** Termes de Vu(O) pour un observateur, à composer au rendu. */
export interface ViewerTerms {
  readonly viewer: Viewer;
  /** Origine effective de la ligne de vue (ramenée dans la carte, décalée d'un epsilon si O est sur un mur). */
  readonly origin: Vec;
  /** LOS(O), en ordre angulaire croissant autour de `origin`. */
  readonly los: Polygon;
  /** Pièce fermée la plus intérieure contenant O : la vue y est confinée. */
  readonly clipRoom: RoomTerm | null;
  /** Pièces fermées qui ne contiennent pas O : retirées de la vue. */
  readonly subtractRooms: readonly RoomTerm[];
  readonly visionRadius: number;
}

/** Aire éclairée d'une lumière : disque ∩ vue depuis la lumière. */
export interface LightArea {
  readonly id: string;
  readonly center: Vec;
  readonly radius: number;
  readonly falloff: number;
  /** Polygone de vue depuis la lumière coupé au disque (vide si éteinte). */
  readonly polygon: Polygon;
}

/** Ce que voit un observateur ou un joueur. */
export interface View {
  readonly viewers: readonly ViewerTerms[];
  /** Lumières allumées de la scène, avec leur aire. */
  readonly lights: readonly LightArea[];
  contains(p: Vec): boolean;
  containsXY(x: number, y: number): boolean;
  /** Vrai si l'un des points est vu. Points `Vec[]` ou à plat `[x0, y0, …]`. */
  containsAny(points: Float64Array | readonly Vec[]): boolean;
}

interface Term {
  readonly px: number;
  readonly py: number;
  readonly r2: number;
  readonly star: StarPolygon;
  /** Rang (parmi les pièces fermées) de la pièce de confinement, −1 sinon. */
  readonly clip: number;
  /** Pour chaque pièce fermée (par rang) : contient-elle O ? */
  readonly inClosed: Uint8Array;
}

function lightAreaOf(prep: PreparedScene, l: PreparedLight): LightArea {
  const star = lightStar(prep, l);
  l.polygon ??= clipStarToDisc(star, l.radius);
  return {
    id: l.light.id,
    center: l.light.pos,
    radius: l.radius,
    falloff: l.light.falloff ?? 0,
    polygon: l.polygon,
  };
}

/**
 * Aire éclairée d'une lumière : polygone de vue depuis sa position, coupé à son rayon (le client
 * y dessine le dégradé radial). Lumière de la scène : calculée une fois puis gardée.
 */
export function lightArea(prep: PreparedScene, light: Light): LightArea {
  const known = prep.lights.find((l) => l.light === light);
  if (known) return lightAreaOf(prep, known);
  const empty = {
    id: light.id,
    center: light.pos,
    radius: light.radius,
    falloff: light.falloff ?? 0,
    polygon: new Float64Array(0),
  };
  if (!light.on || !(light.radius > 0)) return empty;
  const star = computeStar(prep.core.walls, light.pos.x, light.pos.y, light.radius);
  return { ...empty, polygon: clipStarToDisc(star, light.radius) };
}

/**
 * Polygone de vue (LOS) depuis `origin` : `Float64Array` `[x0, y0, x1, y1, …]` en ordre
 * angulaire croissant (sens horaire à l'écran), sans doublon. Avec `maxRadius`, seuls les murs
 * proches sont examinés et le polygone est coupé au disque de ce rayon.
 */
export function visibilityPolygon(
  prep: PreparedScene,
  origin: Vec,
  opts: { maxRadius?: number } = {},
): Polygon {
  const r = opts.maxRadius;
  if (r !== undefined && Number.isFinite(r)) {
    if (!(r > 0)) return new Float64Array(0);
    const star = computeStar(prep.core.walls, origin.x, origin.y, r);
    return clipStarToDisc(star, r);
  }
  return computeStar(prep.core.walls, origin.x, origin.y, Infinity).points;
}

function buildTerm(prep: PreparedScene, viewer: Viewer): { term: Term; terms: ViewerTerms } {
  const core = prep.core;
  const star = computeStar(core.walls, viewer.pos.x, viewer.pos.y, Infinity);
  const inClosed = new Uint8Array(Math.max(1, core.closed.length));
  const subtract: RoomTerm[] = [];
  for (let rank = 0; rank < core.closed.length; rank++) {
    const room = core.rooms[core.closed[rank]!]!;
    if (room.shape.contains(star.ox, star.oy)) inClosed[rank] = 1;
    else subtract.push({ id: room.id, polygon: room.shape.coords });
  }
  const clipIndex = innermostRoomIndex(prep, star.ox, star.oy, true);
  const clip = clipIndex < 0 ? -1 : core.closedRank[clipIndex]!;
  const r =
    Number.isFinite(viewer.visionRadius) && viewer.visionRadius > 0 ? viewer.visionRadius : 0;
  const clipRoom = clipIndex < 0 ? null : core.rooms[clipIndex]!;
  return {
    term: {
      px: viewer.pos.x,
      py: viewer.pos.y,
      r2: r * r,
      star,
      clip,
      inClosed,
    },
    terms: {
      viewer,
      origin: { x: star.ox, y: star.oy },
      los: star.points,
      clipRoom: clipRoom ? { id: clipRoom.id, polygon: clipRoom.shape.coords } : null,
      subtractRooms: subtract,
      visionRadius: r,
    },
  };
}

class VisionView implements View {
  readonly viewers: readonly ViewerTerms[];
  readonly lights: readonly LightArea[];
  private readonly prep: PreparedScene;
  private readonly terms: readonly Term[];

  constructor(prep: PreparedScene, viewers: readonly Viewer[]) {
    this.prep = prep;
    const terms: Term[] = [];
    const exposed: ViewerTerms[] = [];
    for (const v of viewers) {
      if (!Number.isFinite(v.pos.x) || !Number.isFinite(v.pos.y)) continue;
      const built = buildTerm(prep, v);
      terms.push(built.term);
      exposed.push(built.terms);
    }
    this.terms = terms;
    this.viewers = exposed;
    // Les aires des lumières sont calculées ici, une fois : contains() n'alloue rien.
    this.lights = prep.lights.map((l) => lightAreaOf(prep, l));
  }

  contains(p: Vec): boolean {
    return this.containsXY(p.x, p.y);
  }

  containsXY(x: number, y: number): boolean {
    const prep = this.prep;
    const terms = this.terms;
    const hasClosed = prep.core.closed.length > 0;
    const scratch = prep.core.roomScratch;
    // Termes indépendants de l'observateur, calculés au plus une fois (−1 : pas encore).
    let fog = -1;
    let lit = -1;
    let nRooms = -1;
    for (let t = 0; t < terms.length; t++) {
      const term = terms[t]!;
      // Portée : disque de vision, sinon hors brouillard, sinon éclairé.
      const dx = x - term.px;
      const dy = y - term.py;
      if (dx * dx + dy * dy > term.r2) {
        if (fog < 0) fog = inFogXY(prep, x, y) ? 1 : 0;
        if (fog === 1) {
          if (lit < 0) lit = isLitXY(prep, x, y) ? 1 : 0;
          if (lit === 0) continue;
        }
      }
      // Pièce : les pièces fermées qui contiennent p doivent toutes contenir O, et p doit être
      // dans la pièce de confinement de O.
      if (hasClosed) {
        if (nRooms < 0) nRooms = closedRoomsAt(prep, x, y);
        let ok = term.clip < 0;
        for (let k = 0; k < nRooms; k++) {
          const rank = scratch[k]!;
          if (term.inClosed[rank] === 0) {
            ok = false;
            break;
          }
          if (rank === term.clip) ok = true;
        }
        if (!ok) continue;
      }
      // Ligne de vue.
      if (starContains(term.star, x, y)) return true;
    }
    return false;
  }

  containsAny(points: Float64Array | readonly Vec[]): boolean {
    if (points instanceof Float64Array) {
      for (let i = 0; i + 1 < points.length; i += 2) {
        if (this.containsXY(points[i]!, points[i + 1]!)) return true;
      }
      return false;
    }
    for (const p of points) if (this.containsXY(p.x, p.y)) return true;
    return false;
  }
}

/** Vu(O) pour un observateur. */
export function viewerView(prep: PreparedScene, viewer: Viewer): View {
  return new VisionView(prep, [viewer]);
}

/** Vu(joueur) = union des vues de ses observateurs. Sans observateur, rien n'est vu. */
export function playerView(prep: PreparedScene, viewers: readonly Viewer[]): View {
  return new VisionView(prep, viewers);
}

/** Une entité est vue si l'un de ses points d'échantillon l'est (`sampleCircle`, `sampleRect`). */
export function isEntityVisible(view: View, samples: Float64Array | readonly Vec[]): boolean {
  return view.containsAny(samples);
}
