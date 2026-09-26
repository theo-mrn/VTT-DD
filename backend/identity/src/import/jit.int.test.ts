/**
 * Migration à la première connexion, avec un Firebase simulé.
 */
import { loadConfig } from '@vtt/platform';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildIdentity } from '../app.js';
import { IdentityConfig } from '../config.js';
import { createDb, type Db } from '../db/client.js';
import { legacyIds, outbox, users } from '../db/schema.js';
import { generateSigningJwk } from '../tokens/jwt.js';
import { champsFirestore, type ClientFirebase } from './firebase-jit.js';

const URL = process.env.TEST_DATABASE_URL;

describe('champsFirestore', () => {
  it('convertit les valeurs de l’API REST de Firestore', () => {
    expect(
      champsFirestore({
        name: { stringValue: 'Théo' },
        timeSpent: { integerValue: '125' },
        showPremiumBadge: { booleanValue: false },
        settings: { mapValue: { fields: { theme: { stringValue: 'sombre' } } } },
        titres: { arrayValue: { values: [{ stringValue: 'a' }] } },
        vide: { nullValue: null },
      }),
    ).toEqual({
      name: 'Théo',
      timeSpent: 125,
      showPremiumBadge: false,
      settings: { theme: 'sombre' },
      titres: ['a'],
      vide: null,
    });
  });
});

describe.skipIf(!URL)('migration à la première connexion', () => {
  let db: Db;
  let fermer: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildIdentity>>;
  const suffixe = crypto.randomUUID().slice(0, 8);
  const email = `test-${suffixe}@exemple.fr`;
  const uid = `fb-jit-${suffixe}`;
  let appelsFirebase = 0;

  const faux: ClientFirebase = {
    async verifier(e, mdp) {
      appelsFirebase++;
      if (e.toLowerCase() !== email || mdp !== 'ancien-mot-de-passe') return null;
      return {
        auth: { localId: uid, email, emailVerified: true, createdAt: '1600000000000' },
        profil: { name: 'Ancien Joueur', titre: 'Vétéran', timeSpent: 90, bio: 'MJ' },
      };
    },
  };

  beforeAll(async () => {
    const c = createDb(URL!);
    db = c.db;
    fermer = () => c.pool.end();
    app = await buildIdentity(
      loadConfig(IdentityConfig, {
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        DATABASE_URL: URL!,
        JWT_ISSUER: 'https://auth.test.local',
        JWT_AUDIENCE: 'vtt-api',
        JWT_PRIVATE_JWKS: JSON.stringify([await generateSigningJwk('test')]),
        COOKIE_SECURE: 'false',
      }),
      { db, migrationFirebase: faux },
    );
  });

  afterAll(async () => {
    await app?.close();
    const ids = (await db.select({ id: users.id }).from(users).where(eq(users.email, email))).map(
      (u) => u.id,
    );
    if (ids.length) {
      await db.delete(outbox).where(inArray(sql`${outbox.envelope}->'aggregate'->>'id'`, ids));
      await db.delete(legacyIds).where(inArray(legacyIds.id, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await fermer();
  });

  const connexion = (e: string, mdp: string) =>
    app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: e, password: mdp } });

  it('refuse un mauvais mot de passe sans créer de compte', async () => {
    expect((await connexion(email, 'faux')).statusCode).toBe(401);
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
  });

  it('crée le compte à la première connexion, avec son profil et son ancien uid', async () => {
    const res = await connexion(email.toUpperCase(), 'ancien-mot-de-passe');
    expect(res.statusCode).toBe(200);
    const moi = await app.inject({
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${res.json().accessToken}` },
    });
    expect(moi.json()).toMatchObject({
      name: 'Ancien Joueur',
      title: 'Vétéran',
      timeSpentMinutes: 90,
      emailVerified: true,
      hasPassword: true,
    });
    const [lien] = await db.select().from(legacyIds).where(eq(legacyIds.legacyId, uid));
    expect(lien?.id).toBe(res.json().user.id);
  });

  it('se reconnecte ensuite localement, sans rappeler Firebase', async () => {
    const avant = appelsFirebase;
    expect((await connexion(email, 'ancien-mot-de-passe')).statusCode).toBe(200);
    expect(appelsFirebase).toBe(avant);
    expect((await connexion(email, 'faux')).statusCode).toBe(401);
  });
});
