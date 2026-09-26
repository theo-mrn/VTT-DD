/**
 * Service identity complet pour les tests d'intégration, branché sur le
 * PostgreSQL de TEST_DATABASE_URL (rôle identity_svc) avec une boîte aux
 * lettres en mémoire. Chaque test crée ses propres comptes (e-mails uniques)
 * et les supprime ensuite : les tests des différents modules peuvent tourner
 * en même temps sur la même base.
 */
import { loadConfig } from '@vtt/platform';
import { inArray, sql } from 'drizzle-orm';
import { buildIdentity } from '../app.js';
import { IdentityConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { outbox, users } from '../db/schema.js';
import { mailerDeTest } from '../mail/mailer.js';
import { generateSigningJwk } from '../tokens/jwt.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Adresse de la plage de documentation 198.18.0.0/15, différente à chaque appel. */
export function ipAleatoire(): string {
  const o = crypto.getRandomValues(new Uint8Array(2));
  return `198.18.${o[0]}.${o[1]}`;
}

export async function appDeTest(surcharges: Record<string, string> = {}) {
  const { db, pool } = createDb(TEST_DATABASE_URL!);
  const mailer = mailerDeTest();
  const app = await buildIdentity(
    loadConfig(IdentityConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL!,
      JWT_ISSUER: 'https://auth.test.local',
      JWT_AUDIENCE: 'vtt-api',
      JWT_PRIVATE_JWKS: JSON.stringify([await generateSigningJwk('test')]),
      COOKIE_SECURE: 'false',
      APP_URL: 'http://front.test',
      ...surcharges,
    }),
    { db, mailer },
  );

  const ids: string[] = [];

  /** Crée un compte par l'API et renvoie son jeton d'accès. */
  async function inscrire(nom = 'Joueur', motDePasse = 'motdepasse-solide') {
    const email = `test-${crypto.randomUUID()}@exemple.fr`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: motDePasse, name: nom },
      // Une IP par inscription : la limite de 10 inscriptions/min/IP ne doit pas
      // faire échouer les tests qui créent beaucoup de comptes
      remoteAddress: ipAleatoire(),
    });
    if (res.statusCode !== 201) throw new Error(`inscription : ${res.statusCode} ${res.body}`);
    const corps = res.json() as { accessToken: string; user: { id: string } };
    ids.push(corps.user.id);
    const refresh = res.cookies.find((c) => c.name === 'vtt_refresh')?.value;
    return {
      id: corps.user.id,
      email,
      motDePasse,
      jeton: corps.accessToken,
      refresh,
      auth: { authorization: `Bearer ${corps.accessToken}` },
    };
  }

  async function fermer() {
    await app.close();
    if (ids.length) {
      await db.delete(outbox).where(inArray(sql`${outbox.envelope}->'aggregate'->>'id'`, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await pool.end();
  }

  return { app, db, mailer, inscrire, fermer, suivre: (id: string) => ids.push(id) };
}
