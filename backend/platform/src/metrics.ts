/**
 * Métriques (docs/observabilite.md § 5) : instruments OpenTelemetry créés à la première mesure,
 * exportés par le SDK du service (`telemetry.ts`). Sans SDK démarré (tests, dev sans collecteur),
 * ils ne font rien.
 */
import { metrics, type Meter } from '@opentelemetry/api';

/** Compteurs et jauges d'un domaine (`dice`, `campaign`, `@vtt/platform`…). */
export function meter(name = '@vtt/platform'): Meter {
  return metrics.getMeter(name);
}

/**
 * Instruments créés une seule fois, à la première utilisation : le fournisseur global du SDK
 * est alors en place (`node --import instrumentation.js`).
 */
export function lazyInstruments<T>(make: (m: Meter) => T, name?: string): () => T {
  let made: T | undefined;
  return () => (made ??= make(meter(name)));
}
