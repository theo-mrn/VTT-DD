/**
 * Parcours d'authentification complets par HTTP, sur un vrai PostgreSQL
 * (rôle identity_svc). Ignorés si TEST_DATABASE_URL est absent.
 */
import { loadConfig } from '@vtt/platform';
import { inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildIdentity } from '../app.js';
import { IdentityConfig } from '../config.js';
import { createPasswordAccount } from '../db/accounts.js';
import { createDb, type Db } from '../db/client.js';
import { outbox, users } from '../db/schema.js';
import { generateSigningJwk } from '../tokens/jwt.js';
import { CSRF_HEADER, REFRESH_COOKIE } from './auth.js';

const URL = process.env.TEST_DATABASE_URL;

// Paramètres et compte de l'exemple public de Firebase (README de firebase/scrypt)
const FIREBASE = {
  FIREBASE_SCRYPT_SIGNER_KEY:
    'jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==', // gitleaks:allow
  FIREBASE_SCRYPT_SALT_SEPARATOR: 'Bw==',
  FIREBASE_SCRYPT_ROUNDS: '8',
  FIREBASE_SCRYPT_MEM_COST: '14',
};
const HASH_FIREBASE =
  'lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ==';
const SEL_FIREBASE = '42xEC+ixf3L2lw==';

describe.skipIf(!URL)('authentification par HTTP', () => {
  let db: Db;
  let fermer: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildIdentity>>;
  const adresses: string[] = [];
  const email = () => {
    const a = `test-${crypto.randomUUID()}@exemple.fr`;
    adresses.push(a);
    return a;
  };

  beforeAll(async () => {
    const c = createDb(URL!);
    db = c.db;
    fermer = () => c.pool.end();
    const config = loadConfig(IdentityConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: URL!,
      JWT_ISSUER: 'https://auth.test.local',
      JWT_AUDIENCE: 'vtt-api',
      JWT_PRIVATE_JWKS: JSON.stringify([await generateSigningJwk('test')]),
      COOKIE_SECURE: 'false',
      ...FIREBASE,
    });
    app = await buildIdentity(config, { db });
  });

  afterAll(async () => {
    await app?.close();
    if (adresses.length) {
      const ids = (
        await db.select({ id: users.id }).from(users).where(inArray(users.email, adresses))
      ).map((u) => u.id);
      if (ids.length) {
        await db.delete(outbox).where(inArray(sql`${outbox.envelope}->'aggregate'->>'id'`, ids));
        await db.delete(users).where(inArray(users.id, ids));
      }
    }
    await fermer();
  });

  const cookieDe = (res: { cookies: { name: string; value: string }[] }) =>
    res.cookies.find((c) => c.name === REFRESH_COOKIE)?.value;

  it('inscription, profil, renouvellement puis déconnexion', async () => {
    const adresse = email();
    const inscription = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: adresse, password: 'motdepasse-solide', name: 'Théo' },
    });
    expect(inscription.statusCode).toBe(201);
    const { accessToken } = inscription.json();
    const cookie1 = cookieDe(inscription);
    expect(cookie1).toBeTruthy();
    const brut = inscription.headers['set-cookie'] as string;
    expect(brut).toMatch(/HttpOnly/i);
    expect(brut).toMatch(/SameSite=Strict/i);
    expect(brut).toMatch(/Path=\/v1\/auth/);

    const moi = await app.inject({
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(moi.statusCode).toBe(200);
    expect(moi.json()).toMatchObject({ email: adresse, name: 'Théo', showPremiumBadge: true });

    const renouvele = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { [CSRF_HEADER]: '1' },
      cookies: { [REFRESH_COOKIE]: cookie1! },
    });
    expect(renouvele.statusCode).toBe(200);
    const cookie2 = cookieDe(renouvele);
    expect(cookie2).toBeTruthy();
    expect(cookie2).not.toBe(cookie1);

    const sortie = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { [CSRF_HEADER]: '1' },
      cookies: { [REFRESH_COOKIE]: cookie2! },
    });
    expect(sortie.statusCode).toBe(204);
    const apres = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { [CSRF_HEADER]: '1' },
      cookies: { [REFRESH_COOKIE]: cookie2! },
    });
    expect(apres.statusCode).toBe(401);
  });

  it('un compte importé de Firebase se connecte avec son ancien mot de passe, puis passe en argon2id', async () => {
    const adresse = email();
    const userId = await createPasswordAccount(
      db,
      { correlationId: 'import-test' },
      {
        email: adresse,
        name: 'Ancien joueur',
        password: { algorithm: 'firebase-scrypt', hash: HASH_FIREBASE, salt: SEL_FIREBASE },
      },
    );

    const connexion = () =>
      app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: adresse, password: 'user1password' },
      });

    expect((await connexion()).statusCode).toBe(200);
    const [apres] = (
      await db.execute<{ algorithm: string }>(
        sql`SELECT algorithm FROM identity.credentials WHERE user_id = ${userId}`,
      )
    ).rows;
    expect(apres?.algorithm).toBe('argon2id');

    // Même mot de passe, désormais vérifié en argon2id
    expect((await connexion()).statusCode).toBe(200);
    const faux = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: adresse, password: 'user1Password' },
    });
    expect(faux.statusCode).toBe(401);
  });

  it('ne révèle pas si un compte existe', async () => {
    const adresse = email();
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: adresse, password: 'motdepasse-solide', name: 'X' },
    });
    const mauvaisMdp = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: adresse, password: 'faux' },
    });
    const inconnu = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: `absent-${crypto.randomUUID()}@exemple.fr`, password: 'faux' },
    });
    expect(mauvaisMdp.statusCode).toBe(401);
    expect(inconnu.statusCode).toBe(401);
    expect(inconnu.json().detail).toBe(mauvaisMdp.json().detail);
  });

  it('refuse un e-mail déjà pris (409) quelle que soit la casse', async () => {
    const adresse = email();
    const payload = { email: adresse, password: 'motdepasse-solide', name: 'A' };
    expect(
      (await app.inject({ method: 'POST', url: '/v1/auth/register', payload })).statusCode,
    ).toBe(201);
    const doublon = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { ...payload, email: adresse.toUpperCase() },
    });
    expect(doublon.statusCode).toBe(409);
  });

  it('révoque la session quand un refresh token volé est rejoué', async () => {
    const inscription = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: email(), password: 'motdepasse-solide', name: 'Victime' },
    });
    const vole = cookieDe(inscription)!;
    const legitime = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { [CSRF_HEADER]: '1' },
      cookies: { [REFRESH_COOKIE]: vole },
    });
    expect(legitime.statusCode).toBe(200);

    const attaquant = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { [CSRF_HEADER]: '1' },
      cookies: { [REFRESH_COOKIE]: vole },
    });
    expect(attaquant.statusCode).toBe(401);
    const victime = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { [CSRF_HEADER]: '1' },
      cookies: { [REFRESH_COOKIE]: cookieDe(legitime)! },
    });
    expect(victime.statusCode).toBe(401);
  });

  it('exige l’en-tête anti-CSRF pour renouveler ou se déconnecter', async () => {
    const inscription = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: email(), password: 'motdepasse-solide', name: 'C' },
    });
    for (const url of ['/v1/auth/refresh', '/v1/auth/logout']) {
      const res = await app.inject({
        method: 'POST',
        url,
        cookies: { [REFRESH_COOKIE]: cookieDe(inscription)! },
      });
      expect(res.statusCode, url).toBe(403);
    }
  });

  it('publie un JWKS sans clé privée et valide les entrées', async () => {
    const jwks = await app.inject({ url: '/.well-known/jwks.json' });
    expect(jwks.statusCode).toBe(200);
    expect(JSON.stringify(jwks.json())).not.toContain('"d"');

    const court = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: email(), password: 'court', name: 'D' },
    });
    expect(court.statusCode).toBe(400);
    const mauvaisEmail = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'pas-un-email', password: 'x' },
    });
    expect(mauvaisEmail.statusCode).toBe(400);
  });
});
