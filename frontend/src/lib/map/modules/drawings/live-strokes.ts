/**
 * Tracés en cours des autres (docs/carte.md § 8) : reçus par `map.live.stroke`, dessinés chez
 * tous pendant le geste avec la couleur de l'auteur, puis remplacés par le dessin enregistré
 * **sans clignoter** : le fantôme reste jusqu'à l'arrivée du dessin durable du même auteur qui
 * part du même point (ou 3 s après la fin du geste, s'il n'arrive jamais).
 *
 * - main levée : les points s'ajoutent (messages en deltas) ;
 * - forme : on garde l'origine et la dernière extrémité reçue, et son remplissage ;
 * - un dernier message `tool: 'eraser'` annule le tracé (Échap chez l'auteur).
 *
 * Données pures : le rendu (un `Graphics` par fantôme, plan `live`) est dans `register.ts`.
 */
import type { MapDrawingTool } from '@vtt/contracts';
import type { LiveStroke, StrokeEvent } from '../../live/live-channel';
import { LIVE_EXPIRE_MS } from '../../live/live-channel';

/** Après la fin du geste, le fantôme attend le dessin enregistré au plus ce temps. */
export const GHOST_SETTLE_MS = 3_000;
/** Un tracé muet (auteur parti) disparaît après ce temps. */
export const GHOST_IDLE_MS = LIVE_EXPIRE_MS * 2;
/** Écart toléré entre le premier point du fantôme et celui du dessin enregistré. */
export const SETTLE_TOLERANCE = 1;
/** Points à plat gardés au plus par fantôme. */
const MAX_FLAT = 40_000;

const SHAPES: ReadonlySet<string> = new Set(['line', 'rectangle', 'circle']);

export interface Ghost {
  key: string;
  userId: string;
  id: string;
  tool: MapDrawingTool;
  color: string;
  width: number;
  /** Remplissage d'une forme fermée (couleur de l'auteur), null : aucun. */
  fill: string | null;
  /** Points à plat (forme : origine, extrémité). */
  flat: number[];
  startedAt: number;
  last: number;
  ended: boolean;
  endedAt: number;
  /** Change à chaque modification (le rendu ne refait que ce qui a changé). */
  version: number;
}

interface Arrival {
  userId: string;
  x: number;
  y: number;
  t: number;
}

/** Ce que le fantôme lit d'un dessin enregistré. */
export interface ArrivedDrawing {
  createdBy: unknown;
  points: readonly { x: number; y: number }[];
}

/** Forme : origine puis dernière extrémité ; main levée : points ajoutés (plafonnés). */
function appendPoints(flat: number[], tool: MapDrawingTool, pts: readonly number[]) {
  const pairs = Math.floor(pts.length / 2);
  if (!SHAPES.has(tool)) {
    for (let i = 0; i < pairs * 2 && flat.length < MAX_FLAT; i++) flat.push(pts[i]!);
    return;
  }
  if (pairs < 1) return;
  if (flat.length < 2) flat.push(pts[0]!, pts[1]!);
  flat.length = 2;
  flat.push(pts[pairs * 2 - 2]!, pts[pairs * 2 - 1]!);
}

export class LiveStrokes {
  private readonly ghosts = new Map<string, Ghost>();
  private arrivals: Arrival[] = [];
  /** Change à chaque modification de l'ensemble. */
  version = 0;

  get size(): number {
    return this.ghosts.size;
  }

  list(): IterableIterator<Ghost> {
    return this.ghosts.values();
  }

  get(key: string): Ghost | undefined {
    return this.ghosts.get(key);
  }

  /** Message reçu ; renvoie vrai si quelque chose a changé. */
  receive(ev: StrokeEvent, now: number): boolean {
    let changed = false;
    if (ev.stroke) changed = this.applyStroke(ev.userId, ev.stroke, now);
    if (ev.end && this.endGesture(ev.userId, now)) changed = true;
    if (changed) this.version += 1;
    return changed;
  }

  /** Morceau de tracé reçu (gomme : tracé abandonné chez l'auteur) ; vrai si changé. */
  private applyStroke(userId: string, s: LiveStroke, now: number): boolean {
    const key = `${userId}:${s.id}`;
    if (s.tool === 'eraser') return this.ghosts.delete(key);
    const g = this.ghosts.get(key) ?? this.addGhost(key, userId, s, now);
    g.tool = s.tool;
    g.color = s.color;
    g.width = s.width;
    g.fill = s.fill ?? null;
    appendPoints(g.flat, s.tool, s.points);
    g.last = now;
    g.ended = false;
    g.version += 1;
    return true;
  }

  /** Nouveau fantôme, au premier message d'un tracé. */
  private addGhost(key: string, userId: string, s: LiveStroke, now: number): Ghost {
    const g: Ghost = {
      key,
      userId,
      id: s.id,
      tool: s.tool,
      color: s.color,
      width: s.width,
      fill: s.fill ?? null,
      flat: [],
      startedAt: now,
      last: now,
      ended: false,
      endedAt: 0,
      version: 0,
    };
    this.ghosts.set(key, g);
    return g;
  }

  /** Fin du geste d'un auteur : ses fantômes attendent leur dessin ; vrai si changé. */
  private endGesture(userId: string, now: number): boolean {
    let changed = false;
    for (const g of this.ghosts.values())
      if (g.userId === userId && !g.ended) {
        g.ended = true;
        g.endedAt = now;
        changed = true;
      }
    if (this.settle(now)) changed = true;
    return changed;
  }

  /** Un dessin enregistré vient d'arriver ; renvoie vrai si un fantôme s'est posé. */
  arrived(d: ArrivedDrawing, now: number): boolean {
    const first = d.points[0];
    if (typeof d.createdBy !== 'string' || !first) return false;
    // Seuls les auteurs qui dessinent en ce moment nous intéressent
    let drawing = false;
    for (const g of this.ghosts.values()) if (g.userId === d.createdBy) drawing = true;
    if (!drawing) return false;
    this.arrivals.push({ userId: d.createdBy, x: first.x, y: first.y, t: now });
    const changed = this.settle(now);
    if (changed) this.version += 1;
    return changed;
  }

  /** Fantômes finis dont le dessin est arrivé : ils disparaissent. */
  private settle(now: number): boolean {
    this.arrivals = this.arrivals.filter((a) => now - a.t <= GHOST_SETTLE_MS);
    let changed = false;
    for (const g of [...this.ghosts.values()]) {
      if (!g.ended || g.flat.length < 2) continue;
      const i = this.arrivals.findIndex(
        (a) =>
          a.userId === g.userId &&
          a.t >= g.startedAt &&
          Math.abs(a.x - g.flat[0]!) <= SETTLE_TOLERANCE &&
          Math.abs(a.y - g.flat[1]!) <= SETTLE_TOLERANCE,
      );
      if (i < 0) continue;
      this.arrivals.splice(i, 1);
      this.ghosts.delete(g.key);
      changed = true;
    }
    return changed;
  }

  /** Retire les fantômes finis depuis trop longtemps, ou muets ; renvoie vrai si changé. */
  expire(now: number): boolean {
    let changed = false;
    for (const [key, g] of this.ghosts) {
      const done = g.ended ? now - g.endedAt >= GHOST_SETTLE_MS : now - g.last >= GHOST_IDLE_MS;
      if (!done) continue;
      this.ghosts.delete(key);
      changed = true;
    }
    if (changed) this.version += 1;
    return changed;
  }

  /** Délai avant la prochaine expiration (null : aucun fantôme). */
  nextExpiry(now: number): number | null {
    let next: number | null = null;
    for (const g of this.ghosts.values()) {
      const at = g.ended ? g.endedAt + GHOST_SETTLE_MS : g.last + GHOST_IDLE_MS;
      const wait = Math.max(0, at - now);
      if (next === null || wait < next) next = wait;
    }
    return next;
  }

  clear() {
    this.ghosts.clear();
    this.arrivals = [];
    this.version += 1;
  }
}
