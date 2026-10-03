/**
 * SDK Web OpenTelemetry (docs/observabilite.md § 4), chargé à la demande par `<Telemetry />`
 * après le premier affichage : il n'alourdit pas le chargement de la page.
 *
 * - Traces : chargement de la page, requêtes `fetch` vers `/v1/*` (en-tête `traceparent`, le
 *   back continue la même trace), spans métier (`tracer.ts`).
 * - Logs : erreurs du navigateur (`errors.ts`).
 * - Export par lots vers la gateway (`/v1/telemetry/*`, même origine), qui relaie au collecteur.
 */
import { SeverityNumber } from '@opentelemetry/api-logs';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { setErrorSink } from './errors';

let started = false;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Démarre le SDK une seule fois ; `ratio` : part des sessions tracées (0 à 1). */
export function startBrowserTelemetry(o: { ratio: number; version: string }): void {
  if (started) return;
  started = true;
  const origin = window.location.origin;
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'web',
    [ATTR_SERVICE_VERSION]: o.version,
  });

  const provider = new WebTracerProvider({
    resource,
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(o.ratio) }),
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${origin}/v1/telemetry/traces` })),
    ],
  });
  provider.register({ propagator: new W3CTraceContextPropagator() });

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new FetchInstrumentation({
        // Seule l'API est suivie (pas les fichiers, ni R2) ; les envois de télémétrie ne se
        // tracent pas eux-mêmes
        ignoreUrls: [new RegExp(`^(?!${escapeRegExp(origin)}/v1/)`), /\/v1\/telemetry\//],
        // Même origine seulement : le traceparent ne part jamais vers un tiers
        propagateTraceHeaderCorsUrls: [],
      }),
    ],
  });

  const logs = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: `${origin}/v1/telemetry/logs` }),
      }),
    ],
  });
  const logger = logs.getLogger('web');
  setErrorSink((e) =>
    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: e.message,
      attributes: {
        'exception.type': e.type,
        'exception.message': e.message,
        ...(e.stack ? { 'exception.stacktrace': e.stack } : {}),
        ...(e.componentStack ? { 'vtt.component_stack': e.componentStack } : {}),
        'vtt.error.source': e.source,
        'url.path': e.path,
      },
    }),
  );

  // Onglet masqué ou fermé : ce qui attend part tout de suite
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    void provider.forceFlush();
    void logs.forceFlush();
  });
}
