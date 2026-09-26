/**
 * Service dice complet pour les tests, avec des jetons signés par une clé
 * générée pour le test (comme ceux d'identity), de faux campaign et character
 * (serveur HTTP local) et un générateur de dés piloté. Branché sur le
 * PostgreSQL de TEST_DATABASE_URL (rôle dice_svc) pour les tests
 * d'intégration. Chaque test utilise des utilisateurs neufs et supprime
 * ensuite leurs données : les tests peuvent tourner en même temps sur la même base.
 */
import { loadConfig } from '@vtt/platform';
import { aleatoireCrypto, type Generateur } from '@vtt/rules';
import { inArray, or, sql } from 'drizzle-orm';
import { generateKeyPair, SignJWT } from 'jose';
import { buildDice } from '../app.js';
import type { ProfilesClient } from '../clients/profiles.js';
import { DiceConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { inventory, outbox, preferences, rolls } from '../db/schema.js';
import { fakeServices } from './fake-services.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const SECRET = 'secret-interne-de-test-0123456789abcdef';

const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

/**
 * Générateur de test : rejoue les résultats imposés (`force`), puis tire au
 * hasard. Les résultats imposés hors des faces du dé sont ignorés.
 */
export function pilotedRandom() {
  const queue: number[] = [];
  const random = aleatoireCrypto();
  const generator: Generateur = {
    entier: (max) => {
      while (queue.length) {
        const r = queue.shift()!;
        if (r >= 1 && r <= max) return r;
      }
      return random.entier(max);
    },
  };
  /** Remplace les résultats imposés restants. */
  const force = (...values: number[]) => {
    queue.length = 0;
    queue.push(...values);
  };
  return { generator, force };
}

export async function testApp(overrides: Record<string, string> = {}) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const connection = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const services = await fakeServices(SECRET);
  const dice = pilotedRandom();
  const names = new Map<string, string>();
  const profiles: ProfilesClient = {
    profiles: async (ids) =>
      new Map(ids.map((id) => [id, { name: names.get(id) ?? null, avatarUrl: null }])),
  };

  const app = await buildDice(
    loadConfig(DiceConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL ?? 'postgres://absent@localhost:1/aucune',
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      INTERNAL_API_SECRET: SECRET,
      CAMPAIGN_URL: services.url,
      CHARACTER_URL: services.url,
      RIGHTS_CACHE_MS: '0',
      ...overrides,
    }),
    {
      authKeyResolver: async () => publicKey,
      profiles,
      random: () => dice.generator,
      ...(connection ? { db: connection.db } : {}),
    },
  );

  const users: string[] = [];

  const sign = (id: string, roles: string[]) =>
    new SignJWT({ roles })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);

  /** Nouvel utilisateur (identifiant aléatoire) et son en-tête d'autorisation. */
  async function user(name?: string, roles: string[] = ['user']) {
    const id = crypto.randomUUID();
    users.push(id);
    if (name) names.set(id, name);
    return { id, auth: { authorization: `Bearer ${await sign(id, roles)}` } };
  }

  /** Autre jeton pour le même utilisateur (autre session, ou clé d'API). */
  async function token(id: string, roles: string[] = ['user']) {
    return { id, auth: { authorization: `Bearer ${await sign(id, roles)}` } };
  }

  async function close() {
    await app.close();
    await services.close();
    if (connection && users.length) {
      const db = connection.db;
      await db.delete(rolls).where(inArray(rolls.authorId, users));
      await db.delete(preferences).where(inArray(preferences.userId, users));
      await db.delete(inventory).where(inArray(inventory.userId, users));
      await db.delete(outbox).where(
        or(
          inArray(sql`${outbox.envelope}->'actor'->>'userId'`, users),
          inArray(sql`${outbox.envelope}->'payload'->>'authorId'`, users),
          // Événements système (route interne all-skins) : l'utilisateur est dans la charge utile
          inArray(sql`${outbox.envelope}->'payload'->>'userId'`, users),
        ),
      );
    }
    await connection?.pool.end();
  }

  return { app, db: connection?.db, services, dice, user, token, close };
}

export type TestContext = Awaited<ReturnType<typeof testApp>>;
export type TestUser = Awaited<ReturnType<TestContext['user']>>;

/** Jet renvoyé par l'API (lu sans typage strict dans les tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RollBody = Record<string, any>;

/** Raccourcis HTTP : requête brute, ou requête qui doit réussir. */
export function helpers(t: TestContext) {
  type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  const request = (
    u: Pick<TestUser, 'auth'>,
    method: Method,
    url: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ) =>
    t.app.inject({
      method,
      url,
      headers: { ...u.auth, ...headers },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });

  async function ok<T = Record<string, unknown>>(
    u: Pick<TestUser, 'auth'>,
    method: Method,
    url: string,
    payload?: unknown,
  ): Promise<T> {
    const res = await request(u, method, url, payload);
    if (res.statusCode >= 300) throw new Error(`${method} ${url} : ${res.statusCode} ${res.body}`);
    return (res.body ? res.json() : undefined) as T;
  }

  /** Jet qui doit réussir. */
  const roll = (u: Pick<TestUser, 'auth'>, body: Record<string, unknown>) =>
    ok<RollBody>(u, 'POST', '/v1/dice/rolls', body);

  return { request, ok, roll };
}
