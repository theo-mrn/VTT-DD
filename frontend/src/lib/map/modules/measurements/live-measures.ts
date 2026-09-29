/**
 * Mesures des autres (docs/carte.md § 10, Mesures ; § 8) : reçues par `map.live.measure`, une
 * seule par auteur, dessinées chez tous pendant le geste.
 *
 * - après la fin du geste (`end`), elle reste `EPHEMERAL_MS` puis s'efface en
 *   `EPHEMERAL_FADE_MS` ;
 * - `null` : effacée tout de suite (Échap chez l'auteur) ;
 * - `pinned` : épinglée ; elle reste pleine jusqu'à l'arrivée du gabarit durable du même auteur
 *   parti du même point (`arrived`), `PIN_SETTLE_MS` au plus : pas de clignotement ;
 * - un auteur muet en plein geste (parti) : elle disparaît après `IDLE_MS`.
 *
 * Données pures : le rendu est dans `layer.ts`.
 */
import type { LiveMeasure, MeasureEvent } from '../../live/live-channel';
import { LIVE_EXPIRE_MS } from '../../live/live-channel';
import type { Point } from '../../engine/geometry';
import type { MeasureSpec } from './model';

/** Une mesure lâchée reste ce temps, puis s'efface en `EPHEMERAL_FADE_MS`. */
export const EPHEMERAL_MS = 6_000;
export const EPHEMERAL_FADE_MS = 600;
/** Une mesure épinglée attend son gabarit durable au plus ce temps. */
export const PIN_SETTLE_MS = 3_000;
/** Un geste sans nouvelles (auteur parti) : la mesure disparaît. */
export const IDLE_MS = LIVE_EXPIRE_MS * 2;
/** Écart toléré entre l'origine du fantôme et celle du gabarit arrivé. */
const SETTLE_TOLERANCE = 1;

export interface RemoteMeasure {
  userId: string;
  measure: LiveMeasure;
  last: number;
  ended: boolean;
  endedAt: number;
  /** Ce que le rendu reçoit, fait une fois par message (aucune allocation par image). */
  view: ShownMeasure;
}

/** Ce que le rendu dessine d'une mesure (locale ou reçue). */
export interface ShownMeasure {
  key: string;
  spec: MeasureSpec;
  color: string;
  skin: string | null;
  alpha: number;
  fading: boolean;
}

const NO_OPTIONS: Readonly<Record<string, unknown>> = Object.freeze({});

/** Mesure du direct → forme. */
export function liveSpec(m: LiveMeasure): MeasureSpec {
  return {
    shape: m.shape,
    start: { x: m.from[0], y: m.from[1] },
    end: { x: m.to[0], y: m.to[1] },
    options: m.options ?? NO_OPTIONS,
  };
}

/** Opacité d'une mesure lâchée à `age` ms de la fin du geste ; null : expirée. */
export function releasedAlpha(age: number): number | null {
  if (age >= EPHEMERAL_MS + EPHEMERAL_FADE_MS) return null;
  return 1 - Math.min(1, Math.max(0, age - EPHEMERAL_MS) / EPHEMERAL_FADE_MS);
}

export class RemoteMeasures {
  private readonly byUser = new Map<string, RemoteMeasure>();

  get size(): number {
    return this.byUser.size;
  }

  get(userId: string): RemoteMeasure | undefined {
    return this.byUser.get(userId);
  }

  handle(e: MeasureEvent, now: number) {
    if (e.measure === null) {
      this.byUser.delete(e.userId);
      return;
    }
    const known = this.byUser.get(e.userId);
    if (e.measure === undefined) {
      if (known && e.end && !known.ended) {
        known.ended = true;
        known.endedAt = now;
      }
      return;
    }
    // Une nouvelle mesure du même auteur remplace la précédente ; épinglée, elle attend son
    // gabarit (le délai repart de là)
    const ended = e.end || e.measure.pinned === true;
    this.byUser.set(e.userId, {
      userId: e.userId,
      measure: e.measure,
      last: now,
      ended,
      endedAt: ended ? now : 0,
      view: {
        key: `u:${e.userId}`,
        spec: liveSpec(e.measure),
        color: e.measure.color,
        skin: e.measure.skin ?? null,
        alpha: 1,
        fading: false,
      },
    });
  }

  /** Un gabarit durable est arrivé : le fantôme épinglé (ou non) de son auteur s'efface. */
  arrived(createdBy: unknown, start: Point) {
    if (typeof createdBy !== 'string') return;
    const r = this.byUser.get(createdBy);
    if (!r) return;
    const [x, y] = r.measure.from;
    if (Math.abs(x - start.x) <= SETTLE_TOLERANCE && Math.abs(y - start.y) <= SETTLE_TOLERANCE)
      this.byUser.delete(createdBy);
  }

  /** Mesures à dessiner à l'instant `now` (les expirées sont retirées). */
  shown(now: number, out: ShownMeasure[] = []): ShownMeasure[] {
    out.length = 0;
    for (const [userId, r] of this.byUser) {
      let alpha: number | null = 1;
      if (!r.ended) {
        if (now - r.last > IDLE_MS) alpha = null;
      } else if (r.measure.pinned) {
        if (now - r.endedAt > PIN_SETTLE_MS) alpha = null;
      } else alpha = releasedAlpha(now - r.endedAt);
      if (alpha === null) {
        this.byUser.delete(userId);
        continue;
      }
      r.view.alpha = alpha;
      r.view.fading = alpha < 1;
      out.push(r.view);
    }
    return out;
  }

  clear() {
    this.byUser.clear();
  }
}
