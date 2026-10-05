/**
 * Service billing complet pour les tests : jetons signés par une clé générée
 * pour le test (comme ceux d'identity), faux Stripe en mémoire. Les droits
 * publiés se lisent dans l'outbox (rights). Branché sur le PostgreSQL de
 * TEST_DATABASE_URL (rôle billing_svc) pour les tests d'intégration. Chaque
 * test utilise des utilisateurs neufs et supprime ensuite leurs données : les
 * tests peuvent tourner en même temps sur la même base.
 */
import { loadConfig } from '@vtt/platform';
import { inArray, or, sql } from 'drizzle-orm';
import { generateKeyPair, SignJWT } from 'jose';
import { buildBilling } from '../app.js';
import { BillingConfig } from '../config.js';
import { createDb } from '../db/client.js';
import {
  customers,
  entitlements,
  invoices,
  outbox,
  processedEvents,
  purchases,
  rightsVersions,
  subscriptions,
} from '../db/schema.js';
import { fakeStripe, signedEvent, WEBHOOK_SECRET } from './fake-stripe.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

export async function testApp(
  overrides: Record<string, string> = {},
  opts: { withoutStripe?: boolean } = {},
) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const connection = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const stripe = fakeStripe();

  const app = await buildBilling(
    loadConfig(BillingConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL ?? 'postgres://absent@localhost:1/aucune',
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      APP_URL: 'http://front.test/',
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ...overrides,
    }),
    {
      authKeyResolver: async () => publicKey,
      stripe: opts.withoutStripe ? null : stripe.api,
      ...(connection ? { db: connection.db } : {}),
    },
  );

  const users: string[] = [];
  const stripeEvents: string[] = [];

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
    users.push(id);
    return { id, auth: { authorization: `Bearer ${await sign(id, roles)}` } };
  }

  /** Livre un événement Stripe signé au webhook. */
  async function deliver(event: ReturnType<typeof signedEvent>) {
    stripeEvents.push(event.id);
    return app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: event.headers,
      payload: event.payload,
    });
  }

  async function close() {
    await app.close();
    if (connection) {
      const db = connection.db;
      if (users.length) {
        await db.delete(purchases).where(inArray(purchases.userId, users));
        await db.delete(entitlements).where(inArray(entitlements.userId, users));
        await db.delete(invoices).where(inArray(invoices.userId, users));
        await db.delete(subscriptions).where(inArray(subscriptions.userId, users));
        await db.delete(rightsVersions).where(inArray(rightsVersions.userId, users));
        await db.delete(customers).where(inArray(customers.userId, users));
        await db
          .delete(outbox)
          .where(
            or(
              inArray(sql`${outbox.envelope}->'payload'->>'userId'`, users),
              inArray(sql`${outbox.envelope}->'actor'->>'userId'`, users),
            ),
          );
      }
      if (stripeEvents.length)
        await db
          .delete(processedEvents)
          .where(inArray(processedEvents.stripeEventId, stripeEvents));
    }
    await connection?.pool.end();
  }

  /** Événements de l'outbox d'un utilisateur (charge utile ou acteur), dans l'ordre. */
  async function events(userId: string) {
    const rows = await connection!.db
      .select()
      .from(outbox)
      .where(
        or(
          sql`${outbox.envelope}->'payload'->>'userId' = ${userId}`,
          sql`${outbox.envelope}->'actor'->>'userId' = ${userId}`,
        ),
      )
      .orderBy(outbox.createdAt, outbox.id);
    return rows.map(
      (r) =>
        r.envelope as {
          type: string;
          actor: { role: string; userId: string | null };
          payload: Record<string, unknown>;
        },
    );
  }

  /** Droits publiés pour un utilisateur (billing.entitlements_changed), dans l'ordre. */
  async function rights(userId: string) {
    return (await events(userId))
      .filter((e) => e.type === 'billing.entitlements_changed')
      .map((e) => e.payload);
  }

  return { app, db: connection?.db, stripe, user, deliver, events, rights, close };
}

export type TestContext = Awaited<ReturnType<typeof testApp>>;
export type TestUser = Awaited<ReturnType<TestContext['user']>>;

/** Raccourcis HTTP : requête brute, ou requête qui doit réussir. */
export function helpers(t: TestContext) {
  type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  const request = (u: Pick<TestUser, 'auth'>, method: Method, url: string, payload?: unknown) =>
    t.app.inject({
      method,
      url,
      headers: u.auth,
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

  /** Identifiant de la session Checkout d'une URL renvoyée par le service. */
  const sessionIdOf = (url: string) => url.split('/').pop()!;

  return { request, ok, sessionIdOf };
}
