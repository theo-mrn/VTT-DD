/**
 * Service history complet pour les tests, avec des jetons signés par une clé
 * générée pour le test (comme ceux d'identity) et un faux campaign (serveur
 * HTTP local). Branché sur le PostgreSQL de TEST_DATABASE_URL (rôle
 * history_svc) pour les tests d'intégration.
 *
 * Le journal est en ajout seul : les événements des tests ne sont jamais
 * supprimés. Chaque test travaille sur des campagnes neuves (identifiants
 * aléatoires) : les tests peuvent tourner en même temps sur la même base.
 */
import { uuidv7, type EventEnvelope } from '@vtt/contracts';
import { loadConfig } from '@vtt/platform';
import { generateKeyPair, SignJWT } from 'jose';
import { buildHistory } from '../app.js';
import { HistoryConfig } from '../config.js';
import { createDb, type Db } from '../db/client.js';
import { fakeServices } from './fake-services.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
/** Bus de test (facultatif) : les tests de consommation sont ignorés sans lui. */
export const TEST_NATS_URL = process.env.TEST_NATS_URL;

export const SECRET = 'secret-interne-de-test-0123456789abcdef';

const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

/** Enveloppe valide (événement public du MJ par défaut), complétée par `e`. */
export function envelope(
  e: Partial<Omit<EventEnvelope, 'actor'>> & { actor?: Partial<EventEnvelope['actor']> } = {},
): EventEnvelope {
  const { actor, ...rest } = e;
  return {
    id: uuidv7(),
    type: 'character.hp_changed',
    version: 1,
    occurredAt: new Date().toISOString(),
    roomId: null,
    aggregate: { type: 'character', id: crypto.randomUUID() },
    visibility: 'public',
    payload: { before: { hp: 24 }, after: { hp: 17 } },
    correlationId: crypto.randomUUID(),
    causationId: null,
    traceparent: null,
    ...rest,
    actor: { userId: null, role: 'gm', characterId: null, ...actor },
  };
}

/**
 * Exécute `fn` dans une transaction toujours annulée : le journal est en ajout
 * seul, c'est le seul moyen de tester une chaîne cassée sans la laisser en base.
 */
export async function inRollback(db: Db, fn: (tx: Db) => Promise<void>): Promise<void> {
  const rollback = new Error('annulation voulue');
  await db
    .transaction(async (tx) => {
      await fn(tx as unknown as Db);
      throw rollback;
    })
    .catch((e: unknown) => {
      if (e !== rollback) throw e;
    });
}

export async function testApp(
  overrides: Record<string, string> = {},
  options: Parameters<typeof buildHistory>[1] = {},
) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const connection = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const services = await fakeServices(SECRET);

  const app = await buildHistory(
    loadConfig(HistoryConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL ?? 'postgres://absent@localhost:1/aucune',
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      INTERNAL_API_SECRET: SECRET,
      CAMPAIGN_URL: services.url,
      RIGHTS_CACHE_MS: '0',
      ...overrides,
    }),
    {
      authKeyResolver: async () => publicKey,
      consume: false,
      ...(connection ? { db: connection.db } : {}),
      ...options,
    },
  );

  const sign = (id: string, roles: string[]) =>
    new SignJWT({ roles })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);

  /** Nouvel utilisateur (identifiant aléatoire) et son en-tête d'autorisation. */
  async function user(roles: string[] = ['user']) {
    const id = crypto.randomUUID();
    return { id, auth: { authorization: `Bearer ${await sign(id, roles)}` } };
  }

  async function close() {
    await app.close();
    await services.close();
    await connection?.pool.end();
  }

  return { app, db: connection?.db, services, user, close };
}

export type TestContext = Awaited<ReturnType<typeof testApp>>;
export type TestUser = Awaited<ReturnType<TestContext['user']>>;

/** Événement renvoyé par l'API (lu sans typage strict dans les tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventBody = Record<string, any>;

/** Raccourci : GET qui doit réussir. */
export async function get<T = Record<string, unknown>>(
  t: TestContext,
  u: Pick<TestUser, 'auth'>,
  url: string,
): Promise<T> {
  const res = await t.app.inject({ method: 'GET', url, headers: u.auth });
  if (res.statusCode >= 300) throw new Error(`GET ${url} : ${res.statusCode} ${res.body}`);
  return res.json() as T;
}
