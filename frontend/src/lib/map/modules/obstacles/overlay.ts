/**
 * Rendu des surcouches du MJ (murs, pièces, zones de brouillard, lumières), partagé par les
 * modules `obstacles`, `fog` et `lights`.
 *
 * Les traits gardent une épaisseur constante à l'écran. Pixi n'ayant pas de trait « non
 * mis à l'échelle », un `Graphics` est redessiné quand le zoom change de **palier** (× 2^¼,
 * ± 9 %) : entre deux paliers, le trait suit le zoom sans redessin. Au changement de palier, les
 * entités dans la vue sont redessinées à l'image suivante, les autres quand elles y entrent
 * (`OverlayRedraw`). Aucun `Graphics` n'est recréé : on vide et on redessine le même.
 */
import type { Graphics } from 'pixi.js';
import type * as Pixi from 'pixi.js';
import type { MapEntity } from '../../engine/entities/entity';
import { inflateRect, rectsIntersect, type Point } from '../../engine/geometry';
import type { MapEngine } from '../../engine/map-engine';

/** Palier de zoom (quart d'octave). */
export const zoomStep = (zoom: number) => Math.round(Math.log2(Math.max(1e-6, zoom)) * 4);
export const stepZoom = (step: number) => 2 ** (step / 4);
/** Pixels du monde par pixel d'écran au palier de ce zoom. */
export const unitAt = (zoom: number) => 1 / stepZoom(zoomStep(zoom));

/**
 * Redessine des entités au changement de palier de zoom : celles de la vue à l'image suivante,
 * les autres quand elles y entrent.
 */
export class OverlayRedraw {
  private step: number;
  private readonly tracked = new Set<MapEntity>();
  private readonly stale = new Set<MapEntity>();
  private readonly cleanups: (() => void)[];

  constructor(
    private readonly engine: MapEngine,
    private readonly redraw: (e: MapEntity) => void,
  ) {
    this.step = zoomStep(engine.camera.zoom);
    this.cleanups = [
      engine.camera.onChange(() => this.onCamera()),
      engine.onFrame(() => {
        this.flush();
        return false;
      }),
    ];
  }

  /** Pixels du monde par pixel d'écran, au palier courant. */
  get unit(): number {
    return 1 / stepZoom(this.step);
  }

  track(e: MapEntity) {
    this.tracked.add(e);
  }

  untrack(e: MapEntity) {
    this.tracked.delete(e);
    this.stale.delete(e);
  }

  private onCamera() {
    const step = zoomStep(this.engine.camera.zoom);
    if (step === this.step) {
      if (this.stale.size) this.engine.invalidate();
      return;
    }
    this.step = step;
    for (const e of this.tracked) this.stale.add(e);
    this.engine.invalidate();
  }

  /** Avant l'image : redessine les entités périmées qui touchent la vue. */
  private flush() {
    if (!this.stale.size) return;
    const view = this.engine.camera.visibleRect();
    const rect = inflateRect(view, Math.max(view.width, view.height) * 0.1);
    for (const e of this.stale) {
      if (!rectsIntersect(e.bounds(), rect)) continue;
      this.stale.delete(e);
      this.redraw(e);
    }
  }

  dispose() {
    for (const c of this.cleanups.splice(0)) c();
    this.tracked.clear();
    this.stale.clear();
  }
}

/**
 * Trace une ligne brisée en tirets (Pixi n'a pas de pointillés) ; le motif continue d'un
 * segment à l'autre. À suivre d'un `stroke`.
 */
export function dashedPolyline(
  g: Graphics,
  pts: readonly Point[],
  dash: number,
  gap: number,
  closed = false,
) {
  const n = closed ? pts.length : pts.length - 1;
  let phase = 0;
  const period = dash + gap;
  // Pas plus de 4 000 tirets : au-delà (très grand zoom arrière), un trait plein
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (total / period > 4_000) {
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i <= n; i++) g.lineTo(pts[i % pts.length]!.x, pts[i % pts.length]!.y);
    return;
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let s = 0;
    while (s < len) {
      const inDash = phase < dash;
      const step = Math.min(len - s, inDash ? dash - phase : period - phase);
      if (inDash) {
        g.moveTo(a.x + ux * s, a.y + uy * s).lineTo(a.x + ux * (s + step), a.y + uy * (s + step));
      }
      s += step;
      phase = (phase + step) % period;
    }
  }
}

/** Cercle en tirets (arcs), à suivre d'un `stroke`. */
export function dashedCircle(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  dash: number,
  gap: number,
) {
  const circumference = 2 * Math.PI * r;
  const count = Math.min(720, Math.max(8, Math.floor(circumference / (dash + gap))));
  const step = (2 * Math.PI) / count;
  const on = step * (dash / (dash + gap));
  for (let i = 0; i < count; i++) {
    const a0 = i * step;
    g.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r).arc(cx, cy, r, a0, a0 + on);
  }
}

/**
 * Couleur d'une donnée (`#rrggbb`, nom CSS…) en nombre Pixi ; `fallback` si elle est vide ou
 * illisible. Mise en cache : la même chaîne n'est lue qu'une fois.
 */
const colorCache = new Map<string, number | null>();
export function dataColor(pixi: typeof Pixi, value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  let parsed = colorCache.get(value);
  if (parsed === undefined) {
    try {
      parsed = new pixi.Color(value).toNumber();
    } catch {
      parsed = null;
    }
    colorCache.set(value, parsed);
  }
  return parsed ?? fallback;
}
