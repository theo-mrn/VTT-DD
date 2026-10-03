/**
 * Compteur de temps de la météo (développement), comme celui de la visibilité : durées des
 * étapes (`step` : simulation, `draw` : mise à jour des objets Pixi, `frame` : tout le module
 * hors rendu, `render` : rendu de son canvas),
 * moyenne et maximum sur les 240 dernières mesures, et le nombre de particules. En
 * développement, `window.__vttWeather` les expose et un résumé part dans la console toutes les
 * 5 s s'il y a eu du travail.
 */

export type WeatherStep = 'step' | 'draw' | 'frame' | 'render';

const WINDOW = 240;

export interface WeatherStepSummary {
  count: number;
  avg: number;
  max: number;
}

export class WeatherStats {
  private readonly samples: Record<WeatherStep, Float64Array> = {
    step: new Float64Array(WINDOW),
    draw: new Float64Array(WINDOW),
    frame: new Float64Array(WINDOW),
    render: new Float64Array(WINDOW),
  };
  private readonly counts: Record<WeatherStep, number> = { step: 0, draw: 0, frame: 0, render: 0 };
  /** Particules vivantes à la dernière image. */
  particles = 0;

  /** Sans allocation : un tampon circulaire par étape. */
  record(step: WeatherStep, ms: number) {
    const n = this.counts[step];
    this.samples[step][n % WINDOW] = ms;
    this.counts[step] = n + 1;
  }

  /** Moyenne des `n` dernières mesures d'une étape (0 sans mesure). */
  recent(step: WeatherStep, n: number): number {
    const count = Math.min(WINDOW, n, this.counts[step]);
    if (!count) return 0;
    let total = 0;
    const end = this.counts[step];
    for (let i = end - count; i < end; i++) total += this.samples[step][i % WINDOW]!;
    return total / count;
  }

  /** Mesures enregistrées depuis le début pour une étape. */
  count(step: WeatherStep): number {
    return this.counts[step];
  }

  summary(): Partial<Record<WeatherStep, WeatherStepSummary>> & { particles: number } {
    const out: Partial<Record<WeatherStep, WeatherStepSummary>> & { particles: number } = {
      particles: this.particles,
    };
    for (const step of ['step', 'draw', 'frame', 'render'] as const) {
      const count = Math.min(WINDOW, this.counts[step]);
      if (!count) continue;
      let total = 0;
      let max = 0;
      for (let i = 0; i < count; i++) {
        const v = this.samples[step][i]!;
        total += v;
        if (v > max) max = v;
      }
      out[step] = {
        count,
        avg: Math.round((total / count) * 1000) / 1000,
        max: Math.round(max * 1000) / 1000,
      };
    }
    return out;
  }
}

/** En développement : `window.__vttWeather` (résumé à la demande : `summary()`). Renvoie l'arrêt. */
export function exposeWeatherStats(stats: WeatherStats): () => void {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return () => {};
  const w = window as unknown as { __vttWeather?: { stats: WeatherStats; summary(): unknown } };
  w.__vttWeather = { stats, summary: () => stats.summary() };
  return () => {
    if (w.__vttWeather?.stats === stats) delete w.__vttWeather;
  };
}
