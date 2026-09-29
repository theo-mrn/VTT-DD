/**
 * Compteur de temps de la visibilité (développement) : durées des étapes, moyenne et maximum
 * sur les 240 dernières mesures. En développement, `window.__vttVision` les expose et un
 * résumé part dans la console toutes les 5 s s'il y a eu du travail.
 */

export type VisionStep = 'prepare' | 'views' | 'masking' | 'sync' | 'render' | 'frame';

const WINDOW = 240;

export interface StepSummary {
  count: number;
  avg: number;
  max: number;
}

export class VisionStats {
  private readonly samples = new Map<VisionStep, number[]>();
  private dirty = false;

  record(step: VisionStep, ms: number) {
    let list = this.samples.get(step);
    if (!list) {
      list = [];
      this.samples.set(step, list);
    }
    list.push(ms);
    if (list.length > WINDOW) list.shift();
    this.dirty = true;
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

  /** Vrai une fois après chaque nouvelle mesure (résumé périodique). */
  takeDirty(): boolean {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }

  clear() {
    this.samples.clear();
  }
}

/** En développement : `window.__vttVision` et un résumé toutes les 5 s. Renvoie l'arrêt. */
export function exposeStats(stats: VisionStats): () => void {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return () => {};
  const w = window as unknown as { __vttVision?: { stats: VisionStats; summary(): unknown } };
  w.__vttVision = { stats, summary: () => stats.summary() };
  const timer = setInterval(() => {
    if (!stats.takeDirty()) return;
    console.debug('[carte] visibilité (ms)', stats.summary());
  }, 5_000);
  return () => {
    clearInterval(timer);
    if (w.__vttVision?.stats === stats) delete w.__vttVision;
  };
}
