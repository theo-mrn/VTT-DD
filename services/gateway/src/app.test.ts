import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '@vtt/platform';
import { generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGateway, GatewayConfig } from './app.js';

let upstream: Server;
let upstreamUrl: string;
let lastHeaders: IncomingHttpHeaders = {};
let privateKey: CryptoKey;
let publicKey: CryptoKey;

beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' }));
  upstream = createServer((req, res) => {
    lastHeaders = req.headers;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ path: req.url }));
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});
afterAll(() => upstream.close());

async function gateway() {
  const config = loadConfig(GatewayConfig, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    JWT_ISSUER: 'https://identity.test',
    JWT_AUDIENCE: 'vtt-api',
    UPSTREAM_CAMPAIGN_URL: upstreamUrl,
    UPSTREAM_IDENTITY_URL: upstreamUrl,
  });
  return buildGateway(config, { authKeyResolver: async () => publicKey });
}

const token = () =>
  new SignJWT({ roles: ['user'] })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject('user-1')
    .setIssuer('https://identity.test')
    .setAudience('vtt-api')
    .setExpirationTime('5m')
    .sign(privateKey);

describe('gateway', () => {
  it('protège les routes proxifiées', async () => {
    const app = await gateway();
    const res = await app.inject({ url: '/v1/rooms/r1' });
    expect(res.statusCode).toBe(401);
  });

  it('proxifie avec jeton et propage la corrélation', async () => {
    const app = await gateway();
    const res = await app.inject({
      url: '/v1/rooms/r1',
      headers: { authorization: `Bearer ${await token()}`, 'x-correlation-id': 'corr-42' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ path: '/v1/rooms/r1' });
    expect(lastHeaders['x-correlation-id']).toBe('corr-42');
    expect(lastHeaders['x-forwarded-user']).toBe('user-1');
    expect(lastHeaders['x-request-id']).toBeDefined();
  });

  it("laisse passer l'authentification sans jeton", async () => {
    const app = await gateway();
    const res = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: {} });
    expect(res.statusCode).toBe(200);
  });

  it("n'expose pas un service absent", async () => {
    const app = await gateway();
    const res = await app.inject({
      url: '/v1/billing/invoices',
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('/v1/me renvoie l’utilisateur du jeton', async () => {
    const app = await gateway();
    const res = await app.inject({
      url: '/v1/me',
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.json()).toEqual({ userId: 'user-1', roles: ['user'] });
  });
});
