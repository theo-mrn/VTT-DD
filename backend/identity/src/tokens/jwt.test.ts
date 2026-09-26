import { BaseConfig, createService, loadConfig } from '@vtt/platform';
import { createLocalJWKSet, decodeProtectedHeader, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCESS_TOKEN_TTL_SECONDS, createJwtSigner, generateSigningJwk } from './jwt.js';

const ISS = 'https://auth.test.local';
const AUD = 'vtt-api';
const USER = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';

let cleA: JWK;
let cleB: JWK;

beforeAll(async () => {
  cleA = await generateSigningJwk('cle-a');
  cleB = await generateSigningJwk('cle-b');
});

/**
 * Service de test monté avec le VRAI middleware d'authentification de
 * @vtt/platform, qui lit les clés publiques du JWKS publié par identity.
 */
async function serviceQuiVerifie(jwks: { keys: JWK[] }) {
  const config = loadConfig(BaseConfig, {
    NODE_ENV: 'test',
    SERVICE_NAME: 'verif',
    LOG_LEVEL: 'silent',
    JWT_ISSUER: ISS,
    JWT_AUDIENCE: AUD,
  });
  const app = await createService({ config, authKeyResolver: createLocalJWKSet(jwks) });
  app.get('/moi', { preHandler: app.authenticate }, async (req) => req.user);
  app.get(
    '/salles/:roomId/mj',
    { preHandler: [app.authenticate, app.requireRoomRole('gm')] },
    async () => ({ ok: true }),
  );
  return app;
}

describe('jetons d’accès', () => {
  it('sont acceptés par le middleware des services, avec rôles et salles', async () => {
    const signer = await createJwtSigner({ privateJwks: [cleA], issuer: ISS, audience: AUD });
    const jeton = await signer.sign({ userId: USER, roles: ['user'], rooms: { r1: 'gm' } });
    const app = await serviceQuiVerifie(signer.jwks());

    const moi = await app.inject({ url: '/moi', headers: { authorization: `Bearer ${jeton}` } });
    expect(moi.statusCode).toBe(200);
    expect(moi.json()).toMatchObject({ userId: USER, roles: ['user'], rooms: { r1: 'gm' } });

    const mj = await app.inject({
      url: '/salles/r1/mj',
      headers: { authorization: `Bearer ${jeton}` },
    });
    expect(mj.statusCode).toBe(200);
    await app.close();
  });

  it('expirent au bout de 15 minutes', async () => {
    const signer = await createJwtSigner({ privateJwks: [cleA], issuer: ISS, audience: AUD });
    const ilYaLongtemps = new Date(Date.now() - (ACCESS_TOKEN_TTL_SECONDS + 60) * 1000);
    const jeton = await signer.sign({ userId: USER, roles: [], rooms: {} }, ilYaLongtemps);
    const app = await serviceQuiVerifie(signer.jwks());
    const res = await app.inject({ url: '/moi', headers: { authorization: `Bearer ${jeton}` } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('sont refusés pour une autre audience', async () => {
    const signer = await createJwtSigner({ privateJwks: [cleA], issuer: ISS, audience: 'autre' });
    const jeton = await signer.sign({ userId: USER, roles: [], rooms: {} });
    const app = await serviceQuiVerifie(signer.jwks());
    const res = await app.inject({ url: '/moi', headers: { authorization: `Bearer ${jeton}` } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('sont refusés s’ils sont signés par une clé absente du JWKS', async () => {
    const pirate = await createJwtSigner({ privateJwks: [cleB], issuer: ISS, audience: AUD });
    const legitime = await createJwtSigner({ privateJwks: [cleA], issuer: ISS, audience: AUD });
    const jeton = await pirate.sign({ userId: USER, roles: ['admin'], rooms: {} });
    const app = await serviceQuiVerifie(legitime.jwks());
    const res = await app.inject({ url: '/moi', headers: { authorization: `Bearer ${jeton}` } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('rotation des clés', () => {
  it('signe avec la première clé et publie les deux : les anciens jetons restent valides', async () => {
    const avant = await createJwtSigner({ privateJwks: [cleA], issuer: ISS, audience: AUD });
    const apres = await createJwtSigner({ privateJwks: [cleB, cleA], issuer: ISS, audience: AUD });
    const ancien = await avant.sign({ userId: USER, roles: [], rooms: {} });
    const nouveau = await apres.sign({ userId: USER, roles: [], rooms: {} });

    expect(decodeProtectedHeader(nouveau).kid).toBe('cle-b');
    const app = await serviceQuiVerifie(apres.jwks());
    for (const jeton of [ancien, nouveau]) {
      const res = await app.inject({ url: '/moi', headers: { authorization: `Bearer ${jeton}` } });
      expect(res.statusCode).toBe(200);
    }
    await app.close();
  });
});

describe('JWKS publié', () => {
  it('ne contient jamais la partie privée des clés', async () => {
    const signer = await createJwtSigner({ privateJwks: [cleA, cleB], issuer: ISS, audience: AUD });
    const { keys } = signer.jwks();
    expect(keys).toHaveLength(2);
    for (const k of keys) {
      expect(k).not.toHaveProperty('d');
      expect(k).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig' });
    }
  });

  it('refuse une configuration sans clé, sans kid ou avec une clé publique seule', async () => {
    await expect(
      createJwtSigner({ privateJwks: [], issuer: ISS, audience: AUD }),
    ).rejects.toThrow();
    const { kid: _kid, ...sansKid } = cleA;
    await expect(
      createJwtSigner({ privateJwks: [sansKid], issuer: ISS, audience: AUD }),
    ).rejects.toThrow(/kid/);
    const { d: _d, ...publique } = cleA;
    await expect(
      createJwtSigner({ privateJwks: [publique], issuer: ISS, audience: AUD }),
    ).rejects.toThrow(/privée/);
  });
});
