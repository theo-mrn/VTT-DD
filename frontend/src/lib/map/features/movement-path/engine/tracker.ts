/**
 * Mon trajet (docs/carte.md § 10, Trajet des déplacements) : suivi du glisser d'un token fait
 * ici (`engine.onDrag`), points de passage, envoi sur le direct et effacement. Sans Pixi : le
 * rendu lit `resolve(now)` à chaque image.
 *
 * - Départ : le centre du token tenu au début du glisser. Le reste de la sélection n'a pas de
 *   trajet propre.
 * - Points de passage (`MAX_POINTS` sommets au plus) : Espace ou clic droit pendant le glisser,
 *   ou un arrêt de `DWELL_MS` à `MIN_WAYPOINT_UNITS` au moins du sommet précédent ; Retour
 *   arrière retire le dernier.
 * - Direct : le trajet part au départ et à chaque point de passage, à l'intersection des
 *   audiences du token prises à chacun de ces points (`engine.liveAudience`, au moment où il y
 *   était) ; un joueur ne reçoit jamais un passage qu'il ne voyait pas.
 * - Fin : validé, le trajet s'efface en `FADE_MS` ; annulé (Échap), il disparaît aussitôt.
 */
import type { LiveAudience } from '@/lib/map/engine/entities/entity-kind';
import type { Point } from '@/lib/map/engine/geometry';
import type { DragEvent, GestureInput, MapEngine } from '@/lib/map/engine/map-engine';
import {
  DWELL_MS,
  FADE_MS,
  flatten,
  intersectAudience,
  MAX_POINTS,
  MIN_WAYPOINT_UNITS,
  TOKEN_KIND,
} from './model';

interface Waypoint {
  point: Point;
  /** Audience du token quand il était là. */
  audience: LiveAudience;
}

interface Tracked {
  entityId: string;
  characterId: string | null;
  /** Départ puis points de passage. */
  points: Waypoint[];
  phase: 'drawing' | 'fading';
  /** Dernier déplacement du glisser (horloge du moteur), et si l'arrêt a déjà posé son point. */
  movedAt: number;
  dwelled: boolean;
  /** Lâcher (phase `fading`) et la place où le token s'est posé. */
  endedAt: number;
  end: Point;
  /** Change à chaque point de passage : le rendu ne refait que ce qui a changé. */
  revision: number;
}

/** Ce que le rendu dessine de mon trajet (objet réutilisé d'une image à l'autre). */
export interface ResolvedPath {
  entityId: string;
  characterId: string | null;
  /** Départ et points de passage. */
  points: readonly Point[];
  /** Position courante du token (aperçu du glisser, ou sa place après le lâcher). */
  end: Point;
  revision: number;
  alpha: number;
}

const flatPoints = (points: readonly Waypoint[]) => flatten(points.map((w) => w.point));

export class PathTracker {
  private tracked: Tracked | null = null;
  private readonly out: ResolvedPath = {
    entityId: '',
    characterId: null,
    points: [],
    end: { x: 0, y: 0 },
    revision: 0,
    alpha: 1,
  };
  private revisions = 0;

  constructor(private readonly engine: MapEngine) {}

  /** Mon trajet en cours de tracé (tests, diagnostic). */
  get active(): { entityId: string; points: readonly Point[] } | null {
    const t = this.tracked;
    return t && t.phase === 'drawing'
      ? { entityId: t.entityId, points: t.points.map((w) => w.point) }
      : null;
  }

  /** Une étape d'un glisser fait ici. */
  onDrag(e: DragEvent) {
    const engine = this.engine;
    if (e.phase === 'start') {
      this.tracked = null;
      const token = e.primary;
      if (token.kind.id !== TOKEN_KIND) return;
      const characterId = (token.data as { characterId?: unknown }).characterId;
      this.tracked = {
        entityId: token.id,
        characterId: typeof characterId === 'string' ? characterId : null,
        points: [
          {
            point: { x: token.geometry.x, y: token.geometry.y },
            audience: engine.liveAudience(token.id),
          },
        ],
        phase: 'drawing',
        movedAt: engine.now(),
        dwelled: false,
        endedAt: 0,
        end: { x: token.geometry.x, y: token.geometry.y },
        revision: ++this.revisions,
      };
      this.send();
      return;
    }
    const t = this.tracked;
    if (!t || t.entityId !== e.primary.id || t.phase !== 'drawing') return;
    if (e.phase === 'move') {
      t.movedAt = engine.now();
      t.dwelled = false;
      return;
    }
    // Fin : posé, il s'efface ; annulé (ou rien n'a bougé), il disparaît
    if (!e.committed) {
      this.tracked = null;
      engine.invalidate();
      return;
    }
    t.phase = 'fading';
    t.endedAt = engine.now();
    t.end = { x: e.primary.geometry.x, y: e.primary.geometry.y };
    engine.invalidate();
  }

  /** Entrée pendant un geste : Espace ou clic droit posent un point, Retour arrière le retire. */
  input(i: GestureInput): boolean {
    if (this.tracked?.phase !== 'drawing') return false;
    if (i.kind === 'button') return i.pointer.button === 2 && (this.addWaypoint(), true);
    const k = i.key;
    if (k.ctrl || k.meta || k.alt) return false;
    const space = k.code === 'Space';
    if (!space && k.key !== 'Backspace') return false;
    // Touche maintenue : prise, sans effet (pas de rafale de points, ni de vue qui se déplace)
    if (k.repeat) return true;
    if (space) this.addWaypoint();
    else this.removeWaypoint();
    return true;
  }

  /** Point de passage à la position courante du token ; faux s'il est trop près ou de trop. */
  addWaypoint(): boolean {
    const t = this.tracked;
    const token = t && this.engine.entity(t.entityId);
    if (!t || !token || t.points.length >= MAX_POINTS) return false;
    const at = { x: token.current.x, y: token.current.y };
    const last = t.points.at(-1)!.point;
    const min = MIN_WAYPOINT_UNITS * this.engine.kindContext().pixelsPerUnit;
    if (Math.hypot(at.x - last.x, at.y - last.y) < min) return false;
    t.points.push({ point: at, audience: this.engine.liveAudience(t.entityId) });
    t.revision = ++this.revisions;
    this.send();
    this.engine.invalidate();
    return true;
  }

  /** Retire le dernier point de passage (jamais le départ). */
  removeWaypoint(): boolean {
    const t = this.tracked;
    if (!t || t.points.length < 2) return false;
    t.points.pop();
    t.revision = ++this.revisions;
    this.send();
    this.engine.invalidate();
    return true;
  }

  /** Le trajet part sur le direct, à l'audience commune de tous ses points. */
  private send() {
    const t = this.tracked;
    const live = this.engine.live;
    if (!t || !live) return;
    let audience: LiveAudience = 'public';
    for (const w of t.points) audience = intersectAudience(audience, w.audience);
    live.path(t.entityId, flatPoints(t.points), audience);
  }

  /**
   * À chaque image : un arrêt de `DWELL_MS` pose un point de passage. Renvoie vrai tant qu'il
   * faut des images (effacement en cours).
   */
  tick(now: number): boolean {
    const t = this.tracked;
    if (!t) return false;
    if (t.phase === 'drawing') {
      if (!t.dwelled && now - t.movedAt >= DWELL_MS) {
        t.dwelled = true;
        this.addWaypoint();
      }
      return false;
    }
    if (now - t.endedAt >= FADE_MS) {
      this.tracked = null;
      this.engine.invalidate();
      return false;
    }
    return true;
  }

  /** Ce que le rendu dessine à l'instant `now` ; null : aucun trajet. */
  resolve(now: number): ResolvedPath | null {
    const t = this.tracked;
    if (!t) return null;
    const token = this.engine.entity(t.entityId);
    if (!token) return null;
    const out = this.out;
    out.entityId = t.entityId;
    out.characterId = t.characterId;
    if (out.revision !== t.revision) out.points = t.points.map((w) => w.point);
    out.revision = t.revision;
    const end = t.phase === 'drawing' ? token.current : t.end;
    out.end.x = end.x;
    out.end.y = end.y;
    out.alpha = t.phase === 'drawing' ? 1 : Math.max(0, 1 - (now - t.endedAt) / FADE_MS);
    return out;
  }

  dispose() {
    this.tracked = null;
  }
}
