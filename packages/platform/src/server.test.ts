import { Writable } from 'node:stream';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BaseConfig, loadConfig } from './config.js';
import { HttpError } from './middleware/error-handler.js';
import { createService } from './server.js';

const ISS = 'https://identity.test';
const AUD = 'vtt-api';

let privateKey: CryptoKey;
let publicKey: CryptoKey;

beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' }));
  await exportJWK(publicKey);
});

function token(claims: Record<string, unknown> = {}, opts: { exp?: string; iss?: string } = {}) {
  return new SignJWT({ roles: ['user'], ...claims })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject('8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f')
    .setIssuer(opts.iss ?? ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey);
}

async function build() {
  const lines: Record<string, unknown>[] = [];
  const logStream = new Writable({
    write(chunk, _enc, cb) {
      for (const l of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(l));
      cb();
    },
  });
  const config = loadConfig(BaseConfig, {
    NODE_ENV: 'test',
    SERVICE_NAME: 'test-svc',
    LOG_LEVEL: 'info',
    JWT_ISSUER: ISS,
    JWT_AUDIENCE: AUD,
    RATE_LIMIT_MAX: '5',
  });
  const app = await createService({ config, authKeyResolver: async () => publicKey, logStream });

  let rolls = 0;
  app.post(
    '/rooms/:roomId/rolls',
    {
      preHandler: [app.authenticate, app.requireRoomRole('player')],
      schema: {
        params: z.object({ roomId: z.string() }),
        body: z.object({ formula: z.string().regex(/^\d+d\d+$/) }),
      },
    },
    async (req, reply) => {
      rolls++;
      req.log.info({ password: 'hunter2', formula: req.body.formula }, 'roll');
      return reply.code(201).send({ n: rolls });
    },
  );
  app.get('/boom', async () => {
    throw new Error('secret interne: postgres://user:pass@db');
  });
  app.get(
    '/gm/:roomId',
    { preHandler: [app.authenticate, app.requireRoomRole('gm')] },
    async () => ({
      ok: true,
    }),
  );
  app.get('/teapot', async () => {
    throw HttpError.conflict('déjà pris');
  });
  await app.ready();
  return { app, lines };
}

describe('createService', () => {
  it('404 au format problem+json avec request id', async () => {
    const { app } = await build();
    const res = await app.inject({ url: '/nope', headers: { 'x-request-id': 'abc-123' } });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.headers['x-request-id']).toBe('abc-123');
    expect(res.json()).toMatchObject({
      status: 404,
      code: 'route_not_found',
      requestId: 'abc-123',
    });
  });

  it('refuse un request id dangereux et en génère un', async () => {
    const { app } = await build();
    const res = await app.inject({ url: '/healthz', headers: { 'x-request-id': 'a\nb<script>' } });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('500 sans fuite du message interne, mais loggé avec la pile', async () => {
    const { app, lines } = await build();
    const res = await app.inject({ url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('postgres://');
    const log = lines.find((l) => l.message === 'request failed');
    expect(log?.level).toBe('error');
    expect(JSON.stringify(log)).toContain('secret interne');
  });

  it('HttpError métier', async () => {
    const { app } = await build();
    const res = await app.inject({ url: '/teapot' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'conflict', detail: 'déjà pris' });
  });

  it('401 sans jeton, avec jeton expiré ou mauvais issuer', async () => {
    const { app } = await build();
    const url = '/rooms/r1/rolls';
    const body = { formula: '1d20' };
    expect((await app.inject({ method: 'POST', url, payload: body })).statusCode).toBe(401);
    for (const t of [await token({}, { exp: '-1m' }), await token({}, { iss: 'https://evil' })]) {
      const res = await app.inject({
        method: 'POST',
        url,
        payload: body,
        headers: { authorization: `Bearer ${t}` },
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it('403 hors salle, 403 si joueur sur une route MJ', async () => {
    const { app } = await build();
    const t = await token({ rooms: { r1: 'player' } });
    const h = { authorization: `Bearer ${t}` };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/rooms/r2/rolls',
          payload: { formula: '1d6' },
          headers: h,
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject({ url: '/gm/r1', headers: h })).statusCode).toBe(403);
  });

  it('400 de validation avec le détail des champs', async () => {
    const { app } = await build();
    const t = await token({ rooms: { r1: 'player' } });
    const res = await app.inject({
      method: 'POST',
      url: '/rooms/r1/rolls',
      payload: { formula: 'drop table' },
      headers: { authorization: `Bearer ${t}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation_failed');
    expect(res.json().errors[0].path).toContain('formula');
  });

  it('idempotence : même clé = même réponse, action exécutée une fois', async () => {
    const { app } = await build();
    const t = await token({ rooms: { r1: 'player' } });
    const req = {
      method: 'POST' as const,
      url: '/rooms/r1/rolls',
      payload: { formula: '1d20' },
      headers: { authorization: `Bearer ${t}`, 'idempotency-key': 'roll-00000001' },
    };
    const a = await app.inject(req);
    const b = await app.inject(req);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(b.json()).toEqual(a.json());
    expect(b.headers['idempotent-replayed']).toBe('true');
    const other = await app.inject({
      ...req,
      headers: { ...req.headers, 'idempotency-key': 'roll-00000002' },
    });
    expect(other.json().n).toBe(2);
  });

  it('masque les secrets dans les logs', async () => {
    const { app, lines } = await build();
    const t = await token({ rooms: { r1: 'player' } });
    await app.inject({
      method: 'POST',
      url: '/rooms/r1/rolls',
      payload: { formula: '2d6' },
      headers: { authorization: `Bearer ${t}` },
    });
    const all = JSON.stringify(lines);
    expect(all).not.toContain('hunter2');
    expect(all).not.toContain(t);
    const roll = lines.find((l) => l.message === 'roll');
    expect(roll).toMatchObject({
      service: 'test-svc',
      env: 'test',
      formula: '2d6',
      password: '[REDACTED]',
    });
    expect(roll?.request_id).toBeDefined();
  });

  it('rate limit : 429 au-delà du quota', async () => {
    const { app } = await build();
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await app.inject({ url: '/teapot' })).statusCode);
    expect(codes.slice(0, 5).every((c) => c === 409)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it('sondes : /healthz et /readyz, readyz à 503 pendant l’arrêt', async () => {
    const { app } = await build();
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/readyz' })).statusCode).toBe(200);
    app.markShuttingDown();
    expect((await app.inject({ url: '/readyz' })).statusCode).toBe(503);
  });

  it('expose un OpenAPI généré depuis les schémas Zod', async () => {
    const { app } = await build();
    const spec = (await app.inject({ url: '/openapi.json' })).json();
    expect(spec.paths['/rooms/{roomId}/rolls']).toBeDefined();
  });
});

describe('loadConfig', () => {
  it('échoue au démarrage avec un message lisible', () => {
    expect(() =>
      loadConfig(BaseConfig.extend({ DATABASE_URL: z.string().url() }), { SERVICE_NAME: 'x' }),
    ).toThrow(/DATABASE_URL/);
  });
});
