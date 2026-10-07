/**
 * Compteur de temps de la visibilité (développement) : durées des étapes, moyenne et maximum
 * sur les 240 dernières mesures. En développement, `window.__vttVision` les expose et un
 * résumé part dans la console toutes les 5 s s'il y a eu du travail.
 */

export type VisionStep =
  | 'prepare'
  | 'views'
  | 'masking'
  | 'sync'
  | 'render'
  | 'frame'
  /** Marquage local de la mémoire de l'exploration (glisser d'un joueur). */
  | 'memory';

const WINDOW = 240;

export interface StepSummary {
  count: number;
  avg: number;
  max: number;
}

export class VisionStats {
  private readonly samples = new Map<VisionStep, number[]>();

  record(step: VisionStep, ms: number) {
    let list = this.samples.get(step);
    if (!list) {
      list = [];
      this.samples.set(step, list);
    }
    list.push(ms);
    if (list.length > WINDOW) list.shift();
  }

  summary(): Partial<Record<VisionStep, StepSummary>> {
    const out: Partial<Record<VisionStep, StepSummary>> = {};
    for (const [step, list] of this.samples) {
      if (!list.length) continue;
      const total = list.reduce((a, b) => a + b, 0);
      out[step] = {
        count: list.length,
        avg: Math.round((total / list.length) * 1000) / 1000,
        max: Math.round(Math.max(...list) * 1000) / 1000,
      };
    }
    return out;
  }

  clear() {
    this.samples.clear();
  }
}

/** En développement : `window.__vttVision` (résumé à la demande : `summary()`). Renvoie l'arrêt. */
export function exposeStats(stats: VisionStats): () => void {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return () => {};
  const w = window as unknown as { __vttVision?: { stats: VisionStats; summary(): unknown } };
  w.__vttVision = { stats, summary: () => stats.summary() };
  return () => {
    if (w.__vttVision?.stats === stats) delete w.__vttVision;
  };
}

/**
 * Diagnostic de la vision en développement : `copy(__vttVisionDebug())` dans la console copie
 * l'état de la vision et du rendu (observateurs, versions, décisions).
 */
export function exposeDebug(read: () => unknown): () => void {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return () => {};
  const w = window as unknown as { __vttVisionDebug?: () => string };
  const fn = () => JSON.stringify(read(), null, 1);
  w.__vttVisionDebug = fn;
  return () => {
    if (w.__vttVisionDebug === fn) delete w.__vttVisionDebug;
  };
}
