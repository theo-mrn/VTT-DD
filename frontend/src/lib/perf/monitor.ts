/**
 * Mesure de la charge (docs/performances.md) : activée par `?perf` dans l'adresse (gardée dans
 * `localStorage` ; `?perf=0` l'éteint). Désactivée, elle ne coûte rien : les sources ne font
 * qu'incrémenter des compteurs, et rien n'est observé ni affiché.
 *
 * Sources : moteurs de carte montés (images rendues et ce qui les demande), messages du temps
 * réel, requêtes réseau et longues tâches (PerformanceObserver), vidéos en lecture, canvases.
 */

const KEY = 'vtt:perf';

let enabled: boolean | null = null;
/** La mesure est demandée (`?perf`), lu une fois par chargement de page. */
export function perfEnabled(): boolean {
  if (enabled !== null) return enabled;
  enabled = false;
  if (typeof window === 'undefined') return false;
  try {
    const param = new URLSearchParams(window.location.search).get('perf');
    if (param !== null) {
      if (param === '0') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, '1');
    }
    enabled = localStorage.getItem(KEY) === '1';
  } catch {
    enabled = false;
  }
  return enabled;
}

/** Compteurs d'un moteur de carte (cumulés). */
export interface MapPerf {
  frames: number;
  ms: number;
  continuous: number;
  camera: number;
  live: number;
  animations: number;
}

const maps = new Set<{ perf: MapPerf }>();
/** Moteur de carte monté : ses compteurs sont lus par le compteur. */
export function attachMapPerf(engine: { perf: MapPerf }): () => void {
  maps.add(engine);
  return () => void maps.delete(engine);
}

let realtimeMessages = 0;
/** Un message reçu du temps réel (événement, éphémère, présence). */
export function countRealtime() {
  realtimeMessages += 1;
}

export interface PerfSnapshot {
  /** Cumuls à l'instant de la mesure ; le compteur fait la différence sur une seconde. */
  map: MapPerf;
  realtime: number;
  requests: number;
  longTasks: number;
  longTaskMs: number;
  /** Vidéos en lecture : largeur × hauteur. */
  videos: string[];
  canvases: number;
  heapMb: number | null;
}

let requests = 0;
let longTasks = 0;
let longTaskMs = 0;
let observing = false;

/** Observe réseau et longues tâches (une fois, seulement si la mesure est active). */
function observe() {
  if (observing || typeof PerformanceObserver === 'undefined') return;
  observing = true;
  try {
    new PerformanceObserver((list) => {
      requests += list.getEntries().length;
    }).observe({ type: 'resource', buffered: false });
  } catch {
    // Type non pris en charge : sans compte des requêtes
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longTasks += 1;
        longTaskMs += e.duration;
      }
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    // Type non pris en charge : sans longues tâches
  }
}

export function perfSnapshot(): PerfSnapshot {
  observe();
  const map: MapPerf = { frames: 0, ms: 0, continuous: 0, camera: 0, live: 0, animations: 0 };
  for (const m of maps) {
    map.frames += m.perf.frames;
    map.ms += m.perf.ms;
    map.continuous += m.perf.continuous;
    map.camera += m.perf.camera;
    map.live += m.perf.live;
    map.animations += m.perf.animations;
  }
  const videos: string[] = [];
  for (const v of document.querySelectorAll('video')) {
    if (!v.paused) videos.push(`${v.videoWidth}×${v.videoHeight}`);
  }
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return {
    map,
    realtime: realtimeMessages,
    requests,
    longTasks,
    longTaskMs,
    videos,
    canvases: document.querySelectorAll('canvas').length,
    heapMb: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
  };
}
