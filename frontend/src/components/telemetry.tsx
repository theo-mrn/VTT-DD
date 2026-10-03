'use client';

import { useEffect } from 'react';
import { installErrorCapture } from '@/lib/telemetry/errors';

const ENABLED = process.env.NEXT_PUBLIC_OTEL_ENABLED === 'true';
const RATIO = Number(process.env.NEXT_PUBLIC_OTEL_SAMPLE_RATIO ?? '1');
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0-dev';

/**
 * Télémétrie du navigateur (docs/observabilite.md § 4) : capture des erreurs dès le montage,
 * SDK OpenTelemetry chargé au premier moment libre, seulement si `NEXT_PUBLIC_OTEL_ENABLED`.
 */
export function Telemetry() {
  useEffect(() => {
    installErrorCapture();
    if (!ENABLED) return;
    const load = () =>
      void import('@/lib/telemetry/sdk').then(({ startBrowserTelemetry }) =>
        startBrowserTelemetry({
          ratio: Number.isFinite(RATIO) ? Math.min(1, Math.max(0, RATIO)) : 1,
          version: VERSION,
        }),
      );
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(load, { timeout: 5_000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(load, 2_000);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
