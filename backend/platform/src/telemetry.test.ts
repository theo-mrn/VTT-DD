/**
 * Démarrage d'OpenTelemetry : rien sans collecteur (tests, développement), un seul SDK par
 * processus, arrêt propre (ce qui attend part au collecteur) ; lecture des variables standard.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { shutdownTelemetry, startTelemetry, startTelemetryFromEnv } from './telemetry.js';

let collector: Server;
let endpoint = '';
const received: string[] = [];

beforeAll(async () => {
  collector = createServer((req, res) => {
    received.push(req.url ?? '');
    req.resume();
    req.on('end', () => res.end('{}'));
  });
  await new Promise<void>((r) => collector.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(collector.address() as AddressInfo).port}/`;
});
afterAll(() => collector.close());
afterEach(() => shutdownTelemetry());

describe('télémétrie', () => {
  it('sans collecteur : rien ne démarre', () => {
    expect(startTelemetry({ serviceName: 'test' })).toBeUndefined();
    startTelemetryFromEnv({});
  });

  it('avec collecteur : un SDK, le même au second appel ; à l’arrêt, les métriques partent', async () => {
    const sdk = startTelemetry({ serviceName: 'test', endpoint, environment: 'test' });
    expect(sdk).toBeDefined();
    expect(startTelemetry({ serviceName: 'autre', endpoint })).toBe(sdk);
    await shutdownTelemetry();
    expect(received).toContain('/v1/metrics');
    startTelemetryFromEnv({ OTEL_SERVICE_NAME: 'svc', OTEL_EXPORTER_OTLP_ENDPOINT: endpoint });
  });
});
