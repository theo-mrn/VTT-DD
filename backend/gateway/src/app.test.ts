import { createHash } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '@vtt/platform';
import { generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGateway, estPoigneeTempsReel, estPublique, GatewayConfig } from './app.js';

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
    UPSTREAM_CHARACTER_URL: upstreamUrl,
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
    const res = await app.inject({ url: '/v1/campaigns/c1' });
    expect(res.statusCode).toBe(401);
  });

  it('proxifie avec jeton et propage la corrélation', async () => {
    const app = await gateway();
    const res = await app.inject({
      url: '/v1/campaigns/c1',
      headers: { authorization: `Bearer ${await token()}`, 'x-correlation-id': 'corr-42' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ path: '/v1/campaigns/c1' });
    expect(lastHeaders['x-correlation-id']).toBe('corr-42');
    expect(lastHeaders['x-forwarded-user']).toBe('user-1');
    expect(lastHeaders['x-request-id']).toBeDefined();
  });

  it("ne relaie plus l'ancien préfixe /v1/rooms", async () => {
    const app = await gateway();
    const res = await app.inject({
      url: '/v1/rooms/r1',
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.statusCode).toBe(404);
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

  it('character : systèmes publics en lecture, personnages protégés', async () => {
    const app = await gateway();
    const liste = await app.inject({ url: '/v1/systems' });
    expect(liste.statusCode).toBe(200);
    expect(liste.json()).toEqual({ path: '/v1/systems' });
    const doc = await app.inject({ url: '/v1/systems/dnd-classic' });
    expect(doc.json()).toEqual({ path: '/v1/systems/dnd-classic' });

    expect((await app.inject({ method: 'POST', url: '/v1/systems', payload: {} })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ url: '/v1/characters' })).statusCode).toBe(401);
    const perso = await app.inject({
      url: '/v1/characters/c1/creation',
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(perso.json()).toEqual({ path: '/v1/characters/c1/creation' });
    expect(lastHeaders['x-forwarded-user']).toBe('user-1');
  });
});

describe('sous-routes', () => {
  it('les modèles du MJ sous /v1/campaigns/:id vont à character, le reste à campaign', async () => {
    const character = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ service: 'character', path: req.url }));
    });
    await new Promise<void>((r) => character.listen(0, '127.0.0.1', r));
    const characterUrl = `http://127.0.0.1:${(character.address() as AddressInfo).port}`;
    try {
      const app = await buildGateway(
        loadConfig(GatewayConfig, {
          NODE_ENV: 'test',
          LOG_LEVEL: 'silent',
          JWT_ISSUER: 'https://identity.test',
          JWT_AUDIENCE: 'vtt-api',
          UPSTREAM_CAMPAIGN_URL: upstreamUrl,
          UPSTREAM_CHARACTER_URL: characterUrl,
        }),
        { authKeyResolver: async () => publicKey },
      );
      const auth = { authorization: `Bearer ${await token()}` };
      for (const path of [
        '/v1/campaigns/c1/npc-templates',
        '/v1/campaigns/c1/npc-templates/t1?x=1',
        '/v1/campaigns/c1/npc-template-categories',
        '/v1/campaigns/c1/object-templates/o1',
      ]) {
        const r = await app.inject({ url: path, headers: auth });
        expect(r.json(), path).toEqual({ service: 'character', path });
      }
      // Ressemblances qui restent à campaign
      for (const path of ['/v1/campaigns/c1/maps', '/v1/campaigns/c1/npc-templates-x']) {
        const r = await app.inject({ url: path, headers: auth });
        expect(r.json(), path).toEqual({ path });
      }
      // Toujours protégé
      expect((await app.inject({ url: '/v1/campaigns/c1/npc-templates' })).statusCode).toBe(401);
      await app.close();
    } finally {
      character.close();
    }
  });
});

describe('webhook Stripe', () => {
  it('passe sans jeton, corps brut et signature relayés octet pour octet', async () => {
    let received: { body: Buffer; headers: IncomingHttpHeaders; url?: string } | undefined;
    const billing = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        received = { body: Buffer.concat(chunks), headers: req.headers, url: req.url };
        res.setHeader('content-type', 'application/json');
        res.end('{"received":true}');
      });
    });
    await new Promise<void>((r) => billing.listen(0, '127.0.0.1', r));
    try {
      const app = await buildGateway(
        loadConfig(GatewayConfig, {
          NODE_ENV: 'test',
          LOG_LEVEL: 'silent',
          JWT_ISSUER: 'https://identity.test',
          JWT_AUDIENCE: 'vtt-api',
          UPSTREAM_BILLING_URL: `http://127.0.0.1:${(billing.address() as AddressInfo).port}`,
        }),
        { authKeyResolver: async () => publicKey },
      );
      // Espaces, ordre des clés et caractères non ASCII : une re-sérialisation les changerait
      const payload = '{ "id":"evt_1",  "type":"checkout.session.completed", "nom":"Élodie" }\n';
      const res = await app.inject({
        method: 'POST',
        url: '/v1/billing/webhook',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'stripe-signature': 't=1,v1=abc',
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(received!.url).toBe('/v1/billing/webhook');
      expect(received!.body.equals(Buffer.from(payload, 'utf8'))).toBe(true);
      expect(received!.headers['stripe-signature']).toBe('t=1,v1=abc');

      // Le reste de /v1/billing exige un jeton
      expect((await app.inject({ url: '/v1/billing/me' })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: 'POST', url: '/v1/billing/checkout', payload: {} })).statusCode,
      ).toBe(401);
    } finally {
      billing.close();
    }
  });
});

describe('estPublique', () => {
  it('ouvre le webhook Stripe en POST, à ce chemin exact seulement', () => {
    expect(estPublique('POST', '/v1/billing/webhook')).toBe(true);
    expect(estPublique('GET', '/v1/billing/webhook')).toBe(false);
    expect(estPublique('POST', '/v1/billing/webhooks')).toBe(false);
    expect(estPublique('POST', '/v1/billing/webhook/x')).toBe(false);
    expect(estPublique('POST', '/v1/billing/checkout')).toBe(false);
  });

  it('ouvre la lecture des systèmes seulement', () => {
    expect(estPublique('GET', '/v1/systems')).toBe(true);
    expect(estPublique('GET', '/v1/systems?x=1')).toBe(true);
    expect(estPublique('HEAD', '/v1/systems/star-wars-eote')).toBe(true);
    expect(estPublique('POST', '/v1/systems')).toBe(false);
    expect(estPublique('GET', '/v1/systemsx')).toBe(false);
    expect(estPublique('GET', '/v1/characters')).toBe(false);
    expect(estPublique('POST', '/v1/auth/login')).toBe(true);
  });
});

/**
 * Faux realtime : accepte l'upgrade WebSocket (réponse 101 écrite à la main),
 * puis envoie une trame texte avec le chemin et les en-têtes reçus.
 */
function fakeRealtime() {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ path: req.url, authorization: req.headers.authorization ?? null }));
  });
  server.on('upgrade', (req, socket) => {
    const accept = createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const body = Buffer.from(
      JSON.stringify({
        path: req.url,
        forwardedFor: req.headers['x-forwarded-for'] ?? null,
        cookie: req.headers.cookie ?? null,
      }),
    );
    const header =
      body.length < 126
        ? Buffer.from([0x81, body.length])
        : Buffer.from([0x81, 126, body.length >> 8, body.length & 0xff]);
    socket.write(Buffer.concat([header, body]));
    socket.on('error', () => undefined);
  });
  return server;
}

describe('temps réel (WebSocket)', () => {
  it('relaie la poignée de main Socket.IO sans jeton, les routes HTTP avec jeton', async () => {
    const realtime = fakeRealtime();
    await new Promise<void>((r) => realtime.listen(0, '127.0.0.1', r));
    const realtimeUrl = `http://127.0.0.1:${(realtime.address() as AddressInfo).port}`;
    const app = await buildGateway(
      loadConfig(GatewayConfig, {
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        JWT_ISSUER: 'https://identity.test',
        JWT_AUDIENCE: 'vtt-api',
        UPSTREAM_REALTIME_URL: realtimeUrl,
        UPSTREAM_CAMPAIGN_URL: upstreamUrl,
      }),
      { authKeyResolver: async () => publicKey },
    );
    try {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const port = (app.server.address() as AddressInfo).port;
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/v1/realtime/socket.io/?EIO=4&transport=websocket`,
      );
      const first = await new Promise<string>((resolve, reject) => {
        ws.addEventListener('message', (m) => resolve(String(m.data)));
        ws.addEventListener('error', () => reject(new Error('WebSocket refusé')));
      });
      ws.close();
      expect(JSON.parse(first)).toEqual({
        path: '/v1/realtime/socket.io/?EIO=4&transport=websocket',
        forwardedFor: '127.0.0.1',
        cookie: null,
      });

      // Upgrade ailleurs : refusé, même avec un jeton
      const ailleurs = new WebSocket(`ws://127.0.0.1:${port}/v1/campaigns/c1`);
      await new Promise<void>((resolve) => {
        ailleurs.addEventListener('error', () => resolve());
        ailleurs.addEventListener('open', () => resolve());
      });
      expect(ailleurs.readyState).not.toBe(WebSocket.OPEN);

      // Routes HTTP du service : jeton exigé par la gateway, puis relayé
      expect((await app.inject({ url: '/v1/realtime/token' })).statusCode).toBe(401);
      const bearer = `Bearer ${await token()}`;
      const res = await app.inject({
        url: '/v1/realtime/token',
        headers: { authorization: bearer },
      });
      expect(res.json()).toEqual({ path: '/v1/realtime/token', authorization: bearer });
    } finally {
      await app.close();
      realtime.close();
    }
  });

  it('seule une demande d’upgrade vers Socket.IO passe sans jeton', () => {
    const ws = { upgrade: 'websocket' };
    expect(estPoigneeTempsReel('/v1/realtime/socket.io/?EIO=4&transport=websocket', ws)).toBe(true);
    expect(estPoigneeTempsReel('/v1/realtime/socket.io/', {})).toBe(false);
    expect(estPoigneeTempsReel('/v1/realtime/token', ws)).toBe(false);
    expect(estPoigneeTempsReel('/v1/campaigns/socket.io/', ws)).toBe(false);
  });
});
