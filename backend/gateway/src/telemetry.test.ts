import { loadConfig } from '@vtt/platform';
import { describe, expect, it } from 'vitest';
import { buildGateway, GatewayConfig } from './app.js';
import { forceBrowserService } from './telemetry.js';

async function gateway(endpoint?: string, sent: { url: string; body: unknown }[] = []) {
  const config = loadConfig(GatewayConfig, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    JWT_ISSUER: 'https://identity.test',
    JWT_AUDIENCE: 'vtt-api',
    ...(endpoint ? { OTEL_EXPORTER_OTLP_ENDPOINT: endpoint } : {}),
  });
  return buildGateway(config, {
    authKeyResolver: async () => {
      throw new Error('pas de jeton ici');
    },
    fetchTelemetry: async (url, init) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(null, { status: 200 });
    },
  });
}

const lot = {
  resourceSpans: [
    {
      resource: { attributes: [{ key: 'service.name', value: { stringValue: 'campaign' } }] },
      scopeSpans: [],
    },
  ],
};

describe('relais de télémétrie du navigateur', () => {
  it('sans collecteur : accepté sans jeton, puis jeté', async () => {
    const app = await gateway();
    const res = await app.inject({ method: 'POST', url: '/v1/telemetry/traces', payload: lot });
    expect(res.statusCode).toBe(204);
  });

  it('relaie au collecteur avec le nom de service imposé', async () => {
    const sent: { url: string; body: unknown }[] = [];
    const app = await gateway('http://collector:4318/', sent);
    const res = await app.inject({ method: 'POST', url: '/v1/telemetry/logs', payload: lot });
    expect(res.statusCode).toBe(204);
    expect(sent[0]!.url).toBe('http://collector:4318/v1/logs');
    expect(JSON.stringify(sent[0]!.body)).toContain('"stringValue":"web"');
    expect(JSON.stringify(sent[0]!.body)).not.toContain('campaign');
  });

  it('refuse un envoi trop lourd ou qui n’est pas du JSON', async () => {
    const app = await gateway('http://collector:4318');
    const big = await app.inject({
      method: 'POST',
      url: '/v1/telemetry/traces',
      payload: { resourceSpans: [{ junk: 'x'.repeat(300 * 1024) }] },
    });
    expect(big.statusCode).toBe(413);
    const proto = await app.inject({
      method: 'POST',
      url: '/v1/telemetry/traces',
      headers: { 'content-type': 'application/x-protobuf' },
      payload: Buffer.from([1, 2, 3]),
    });
    expect(proto.statusCode).toBe(415);
  });

  it('ajoute le nom de service à une ressource qui n’en a pas', () => {
    const body = forceBrowserService({ resourceLogs: [{ scopeLogs: [] }] }) as {
      resourceLogs: { resource: { attributes: unknown[] } }[];
    };
    expect(body.resourceLogs[0]!.resource.attributes).toEqual([
      { key: 'service.name', value: { stringValue: 'web' } },
    ]);
  });
});
