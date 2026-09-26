import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '@vtt/platform';
import { generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildGateway, estInterne, GatewayConfig } from './app.js';
import { creerEchangeurCles } from './cles-api.js';

const SECRET = 'secret-interne-de-test-0123456789abcdef';
const CLE_VALIDE = 'vtt_' + 'A'.repeat(43);
const CLE_REVOQUEE = 'vtt_' + 'R'.repeat(43);

let identity: Server;
let identityUrl: string;
let privateKey: CryptoKey;
let publicKey: CryptoKey;
let echanges: { secret: string | undefined; key: unknown }[] = [];
let relaye: { url: string | undefined; headers: IncomingHttpHeaders } | null = null;

const jeton = (sub: string, roles: string[]) =>
  new SignJWT({ roles, rooms: {} })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(sub)
    .setIssuer('https://identity.test')
    .setAudience('vtt-api')
    .setExpirationTime('15m')
    .sign(privateKey);

/** Identity simulé : route d'échange + écho des autres requêtes. */
beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' }));
  identity = createServer((req, res) => {
    let brut = '';
    req.on('data', (c: Buffer) => (brut += c.toString()));
    req.on('end', async () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/internal/api-keys/exchange' && req.method === 'POST') {
        const secret = req.headers['x-internal-secret'] as string | undefined;
        const { key } = JSON.parse(brut) as { key: unknown };
        echanges.push({ secret, key });
        if (secret !== SECRET || key !== CLE_VALIDE) {
          res.statusCode = 401;
          res.end(JSON.stringify({ status: 401 }));
          return;
        }
        res.end(
          JSON.stringify({
            userId: 'user-api',
            accessToken: await jeton('user-api', ['user', 'api']),
            expiresIn: 900,
          }),
        );
        return;
      }
      relaye = { url: req.url, headers: req.headers };
      res.end(JSON.stringify({ path: req.url }));
    });
  });
  await new Promise<void>((r) => identity.listen(0, '127.0.0.1', r));
  identityUrl = `http://127.0.0.1:${(identity.address() as AddressInfo).port}`;
});
afterAll(() => identity.close());
beforeEach(() => {
  echanges = [];
  relaye = null;
});

async function gateway(env: Record<string, string> = { INTERNAL_API_SECRET: SECRET }) {
  const config = loadConfig(GatewayConfig, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    JWT_ISSUER: 'https://identity.test',
    JWT_AUDIENCE: 'vtt-api',
    UPSTREAM_IDENTITY_URL: identityUrl,
    UPSTREAM_CAMPAIGN_URL: identityUrl,
    ...env,
  });
  return buildGateway(config, { authKeyResolver: async () => publicKey });
}

describe("gateway : clés d'API", () => {
  it('échange « ApiKey » contre « Bearer » et relaie vers le service', async () => {
    const app = await gateway();
    const res = await app.inject({
      url: '/v1/rooms/r1',
      headers: { authorization: `ApiKey ${CLE_VALIDE}`, 'x-internal-secret': 'forge' },
    });
    expect(res.statusCode).toBe(200);
    expect(echanges).toEqual([{ secret: SECRET, key: CLE_VALIDE }]);
    expect(relaye!.url).toBe('/v1/rooms/r1');
    expect(relaye!.headers.authorization).toMatch(/^Bearer ey/);
    expect(relaye!.headers['x-forwarded-user']).toBe('user-api');
    // Le secret envoyé par le client n'est jamais relayé
    expect(relaye!.headers['x-internal-secret']).toBeUndefined();

    const moi = await app.inject({
      url: '/v1/me',
      headers: { authorization: `ApiKey ${CLE_VALIDE}` },
    });
    expect(moi.json()).toEqual({ userId: 'user-api', roles: ['user', 'api'] });
    await app.close();
  });

  it('garde le jeton en cache : un seul échange pour plusieurs requêtes', async () => {
    const app = await gateway();
    const requetes = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({ url: '/v1/rooms/r1', headers: { authorization: `ApiKey ${CLE_VALIDE}` } }),
      ),
    );
    expect(requetes.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
    await app.inject({ url: '/v1/api-keys', headers: { authorization: `ApiKey ${CLE_VALIDE}` } });
    expect(echanges).toHaveLength(1);
    expect(relaye!.url).toBe('/v1/api-keys');
    await app.close();
  });

  it('refuse une clé révoquée ou mal formée', async () => {
    const app = await gateway();
    const revoquee = await app.inject({
      url: '/v1/rooms/r1',
      headers: { authorization: `ApiKey ${CLE_REVOQUEE}` },
    });
    expect(revoquee.statusCode).toBe(401);
    const malFormee = await app.inject({
      url: '/v1/rooms/r1',
      headers: { authorization: 'ApiKey pas une clé' },
    });
    expect(malFormee.statusCode).toBe(401);
    // La clé mal formée n'est même pas envoyée à identity
    expect(echanges).toHaveLength(1);
    expect(relaye).toBeNull();
    await app.close();
  });

  it('refuse les clés d’API sans INTERNAL_API_SECRET', async () => {
    const app = await gateway({});
    const res = await app.inject({
      url: '/v1/rooms/r1',
      headers: { authorization: `ApiKey ${CLE_VALIDE}` },
    });
    expect(res.statusCode).toBe(401);
    expect(echanges).toHaveLength(0);
    // Le Bearer reste accepté
    const bearer = await app.inject({
      url: '/v1/rooms/r1',
      headers: { authorization: `Bearer ${await jeton('u1', ['user'])}` },
    });
    expect(bearer.statusCode).toBe(200);
    await app.close();
  });

  it('ne relaie jamais /internal/* depuis l’extérieur', async () => {
    const app = await gateway();
    for (const url of [
      '/internal/api-keys/exchange',
      '/INTERNAL/api-keys/exchange',
      '/%69nternal/api-keys/exchange',
      '/v1/auth/../../internal/api-keys/exchange',
      '/v1/auth/%2e%2e/%2e%2e/internal/api-keys/exchange',
      '/v1/auth/..%2f..%2finternal/api-keys/exchange',
    ]) {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { 'x-internal-secret': SECRET },
        payload: { key: CLE_VALIDE },
      });
      expect(res.statusCode, url).toBe(404);
    }
    expect(echanges).toHaveLength(0);
    expect(relaye).toBeNull();
    await app.close();
  });

  it('ne relaie pas une clé brute vers une route publique', async () => {
    const app = await gateway();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { authorization: `ApiKey ${CLE_VALIDE}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(relaye!.headers.authorization).toBeUndefined();
    await app.close();
  });
});

describe('cache des jetons', () => {
  it('ré-échange la clé 30 s avant l’expiration du jeton', async () => {
    let t = 1_000_000;
    let appels = 0;
    const echangeur = creerEchangeurCles({
      identityUrl: 'http://identity.test',
      secret: SECRET,
      maintenant: () => t,
      fetch: async () => {
        appels++;
        return new Response(
          JSON.stringify({ userId: 'u', accessToken: `jeton-${appels}`, expiresIn: 900 }),
          { headers: { 'content-type': 'application/json' } },
        );
      },
    });
    expect(await echangeur.jetonPour(CLE_VALIDE)).toBe('jeton-1');
    t += 869_000;
    expect(await echangeur.jetonPour(CLE_VALIDE)).toBe('jeton-1');
    t += 2_000; // à moins de 30 s de l'expiration
    expect(await echangeur.jetonPour(CLE_VALIDE)).toBe('jeton-2');
    expect(appels).toBe(2);
  });

  it('répond 503 si identity est injoignable, sans rien mettre en cache', async () => {
    const echangeur = creerEchangeurCles({
      identityUrl: 'http://identity.test',
      secret: SECRET,
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(echangeur.jetonPour(CLE_VALIDE)).rejects.toMatchObject({ status: 503 });
    expect(echangeur.taille()).toBe(0);
  });
});

describe('détection des routes internes', () => {
  it('laisse passer les routes publiques ordinaires', () => {
    expect(estInterne('/v1/rooms/internal')).toBe(false);
    expect(estInterne('/v1/api-keys?x=/internal')).toBe(false);
    expect(estInterne('/internal')).toBe(true);
    expect(estInterne('//internal/x')).toBe(true);
    // Chemins bruts à segments « .. » (inject les résout avant la gateway)
    expect(estInterne('/v1/auth/../users/me')).toBe(true);
    expect(estInterne('/v1/auth/%2e%2e/users/me')).toBe(true);
    expect(estInterne('/v1/auth/..%5cinternal')).toBe(true);
  });
});
