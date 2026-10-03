/**
 * Initialisation OpenTelemetry. Doit être chargé AVANT le reste du code
 * (`node --import ./dist/instrumentation.js dist/main.js`) pour que les
 * modules http, fastify, pg, ioredis… soient instrumentés.
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export interface TelemetryOptions {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  /** Sans endpoint, la télémétrie est désactivée (tests, dev sans collecteur). */
  endpoint?: string;
}

let sdk: NodeSDK | undefined;

export function startTelemetry(opts: TelemetryOptions): NodeSDK | undefined {
  if (!opts.endpoint || sdk) return sdk;
  const base = opts.endpoint.replace(/\/$/, '');

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: opts.serviceName,
      [ATTR_SERVICE_VERSION]: opts.serviceVersion ?? '0.0.0-dev',
      'deployment.environment.name': opts.environment ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces` }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }),
        exportIntervalMillis: 15_000,
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Trop bruyant, sans valeur pour nous
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        // Les sondes ne doivent pas polluer les traces
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) =>
            req.url === '/healthz' || req.url === '/readyz' || req.url === '/metrics',
        },
      }),
    ],
  });
  sdk.start();
  return sdk;
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
  sdk = undefined;
}

/** Démarrage depuis les variables d'environnement standard. */
export function startTelemetryFromEnv(env: NodeJS.ProcessEnv = process.env): void {
  startTelemetry({
    serviceName: env.SERVICE_NAME ?? env.OTEL_SERVICE_NAME ?? 'unknown-service',
    serviceVersion: env.SERVICE_VERSION,
    environment: env.NODE_ENV,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });
}
