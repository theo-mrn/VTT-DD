'use client';

/**
 * Compteur de charge (`?perf`, `lib/perf/monitor.ts`) : une seconde glissante, en bas à gauche.
 * Seul ce petit composant se met à jour (une fois par seconde) ; rien n'est monté sans `?perf`.
 */
import { useEffect, useState } from 'react';
import { perfEnabled, perfSnapshot, type PerfSnapshot } from '@/lib/perf/monitor';

interface Rates {
  fps: number;
  msPerFrame: number;
  causes: string;
  weatherFps: number;
  weatherMs: number;
  realtime: number;
  requests: number;
  longTasks: number;
  longTaskMs: number;
  videos: string[];
  canvases: number;
  heapMb: number | null;
}

function rates(prev: PerfSnapshot, next: PerfSnapshot, seconds: number): Rates {
  const d = (a: number, b: number) => (b - a) / seconds;
  const frames = next.map.frames - prev.map.frames;
  const causes = (
    [
      ['continu', next.map.continuous - prev.map.continuous],
      ['caméra', next.map.camera - prev.map.camera],
      ['direct', next.map.live - prev.map.live],
      ['animations', next.map.animations - prev.map.animations],
    ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${Math.round(n / seconds)}`)
    .join(' · ');
  return {
    fps: d(prev.map.frames, next.map.frames),
    msPerFrame: frames > 0 ? (next.map.ms - prev.map.ms) / frames : 0,
    causes,
    weatherFps: d(prev.map.weather, next.map.weather),
    weatherMs:
      next.map.weather > prev.map.weather
        ? (next.map.weatherMs - prev.map.weatherMs) / (next.map.weather - prev.map.weather)
        : 0,
    realtime: d(prev.realtime, next.realtime),
    requests: d(prev.requests, next.requests),
    longTasks: next.longTasks - prev.longTasks,
    longTaskMs: next.longTaskMs - prev.longTaskMs,
    videos: next.videos,
    canvases: next.canvases,
    heapMb: next.heapMb,
  };
}

export function PerfOverlay() {
  const [on] = useState(perfEnabled);
  const [r, setR] = useState<Rates | null>(null);

  useEffect(() => {
    if (!on) return;
    let prev = perfSnapshot();
    let at = performance.now();
    const id = window.setInterval(() => {
      const next = perfSnapshot();
      const now = performance.now();
      setR(rates(prev, next, (now - at) / 1000));
      prev = next;
      at = now;
    }, 1000);
    return () => window.clearInterval(id);
  }, [on]);

  if (!on || !r) return null;
  const line = (label: string, value: string, hot = false) => (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={hot ? 'text-destructive' : undefined}>{value}</span>
    </div>
  );
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-2 left-2 z-[100] w-56 rounded-lg border border-border bg-background/95 px-2.5 py-2 font-mono text-[11px] leading-5 shadow-surface"
    >
      {line('carte', `${r.fps.toFixed(0)} i/s · ${r.msPerFrame.toFixed(1)} ms`, r.fps > 5)}
      {r.causes && <div className="truncate text-muted-foreground">{r.causes}</div>}
      {r.weatherFps > 0 &&
        line('météo', `${r.weatherFps.toFixed(0)} i/s · ${r.weatherMs.toFixed(1)} ms`)}
      {line('longues tâches', `${r.longTasks} · ${Math.round(r.longTaskMs)} ms`, r.longTasks > 0)}
      {line('requêtes', `${r.requests.toFixed(0)}/s`, r.requests > 2)}
      {line('temps réel', `${r.realtime.toFixed(0)}/s`)}
      {line('vidéos', r.videos.length ? r.videos.join(', ') : '0', r.videos.length > 0)}
      {line('canvas', String(r.canvases))}
      {r.heapMb !== null && line('mémoire JS', `${r.heapMb} Mo`)}
    </div>
  );
}
