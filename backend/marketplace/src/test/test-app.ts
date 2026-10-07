/**
 * Service marketplace complet pour les tests : jetons signés par une clé du test, campaign et
 * billing simulés en mémoire, stockage en mémoire, signature d'envoi factice. Branché sur le
 * PostgreSQL de TEST_DATABASE_URL (rôle marketplace_svc) pour les tests d'intégration. Chaque
 * test crée ses comptes et supprime ensuite leurs données : les tests tournent en parallèle et
 * ne touchent à rien d'autre dans la base.
 */
import type { MarketplaceCheckoutRequest } from '@vtt/contracts';
import { loadConfig, Uploads } from '@vtt/platform';
import { inArray, or, sql } from 'drizzle-orm';
import { generateKeyPair, SignJWT } from 'jose';
import { buildMarketplace } from '../app.js';
import type { BillingCheckout } from '../clients/billing.js';
import type { CampaignRights, CampaignRole } from '../clients/campaign.js';
import { MarketplaceConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { creators, inbox, installs, listings, outbox, reports } from '../db/schema.js';
import { memoryStorage, PUBLIC_BASE } from './memory-storage.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

export async function testApp(overrides: Record<string, string> = {}) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const connection = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const files = memoryStorage();
  const users: string[] = [];
  const moderator = crypto.randomUUID();

  // Campagnes simulées : rôle de chaque membre
  const roles = new Map<string, Map<string, CampaignRole>>();
  const campaigns: CampaignRights = {
    role: async (campaignId, userId) => roles.get(campaignId)?.get(userId) ?? null,
  };
  // billing simulé : sessions demandées
  const checkouts: MarketplaceCheckoutRequest[] = [];
  const billing: BillingCheckout = {
    checkout: async (r) => {
      checkouts.push(r);
      return { url: `https://checkout.stripe.test/c/pay/cs_test_${checkouts.length}` };
    },
  };

  const config = loadConfig(MarketplaceConfig, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL ?? 'postgres://absent@localhost:1/aucune',
    JWT_ISSUER: ISSUER,
    JWT_AUDIENCE: AUDIENCE,
    MARKETPLACE_MODERATORS: moderator,
    ...overrides,
  });
  const app = await buildMarketplace(config, {
    authKeyResolver: async () => publicKey,
    storage: files.storage,
    uploads: new Uploads(async (s) => `https://signed.test/${s.key}`, PUBLIC_BASE),
    campaigns,
    billing,
    ...(connection ? { db: connection.db } : {}),
  });

  const sign = (id: string, extra: string[] = []) =>
    new SignJWT({ roles: ['user', ...extra] })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);

  async function user(id: string = crypto.randomUUID()) {
    users.push(id);
    return { id, auth: { authorization: `Bearer ${await sign(id)}` } };
  }

  /** Campagne simulée dont `gm` est le MJ (et `players` les joueurs). */
  function campaign(gm: string, players: string[] = []) {
    const id = crypto.randomUUID();
    roles.set(id, new Map([[gm, 'gm'], ...players.map((p) => [p, 'player'] as const)]));
    return id;
  }

  async function close() {
    await app.close();
    if (connection) {
      const db = connection.db;
      if (users.length) {
        const own = (
          await db
            .select({ id: listings.id })
            .from(listings)
            .where(inArray(listings.creatorId, users))
        ).map((l) => l.id);
        await db.delete(installs).where(inArray(installs.userId, users));
        await db.delete(reports).where(inArray(reports.reporterId, users));
        // Fiches des comptes du test : leurs versions, copies, acquisitions et avis partent avec
        if (own.length) await db.delete(listings).where(inArray(listings.id, own));
        await db.delete(creators).where(inArray(creators.userId, users));
        await db
          .delete(outbox)
          .where(
            or(
              inArray(sql`${outbox.envelope}->'actor'->>'userId'`, users),
              ...(own.length
                ? [inArray(sql`${outbox.envelope}->'payload'->>'listingId'`, own)]
                : []),
            ),
          );
      }
      await connection.pool.end();
    }
  }

  return {
    app,
    db: connection?.db,
    files,
    config,
    checkouts,
    moderator: async () => user(moderator),
    user,
    campaign,
    close,
  };
}

export type TestContext = Awaited<ReturnType<typeof testApp>>;
export type TestUser = Awaited<ReturnType<TestContext['user']>>;

/** Raccourcis HTTP. */
export function helpers(t: TestContext) {
  type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  const request = (u: Pick<TestUser, 'auth'>, method: Method, url: string, payload?: unknown) =>
    t.app.inject({
      method,
      url,
      headers: u.auth,
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function ok<T = Record<string, any>>(
    u: Pick<TestUser, 'auth'>,
    method: Method,
    url: string,
    payload?: unknown,
  ): Promise<T> {
    const res = await request(u, method, url, payload);
    if (res.statusCode >= 300) throw new Error(`${method} ${url} : ${res.statusCode} ${res.body}`);
    return (res.body ? res.json() : undefined) as T;
  }

  /** Événements de l'outbox dont l'agrégat ou le payload cite `id`, dans l'ordre. */
  async function events(id: string) {
    const rows = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        or(
          sql`${outbox.envelope}->'aggregate'->>'id' = ${id}`,
          sql`${outbox.envelope}->'payload'->>'listingId' = ${id}`,
          sql`${outbox.envelope}->>'roomId' = ${id}`,
        ),
      )
      .orderBy(outbox.createdAt, outbox.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r) => r.envelope as Record<string, any>);
  }

  return { request, ok, events };
}

/** Purge les lignes d'inbox des événements d'un test (identifiants connus). */
export async function forgetInbox(t: TestContext, ids: string[]) {
  if (t.db && ids.length) await t.db.delete(inbox).where(inArray(inbox.eventId, ids));
}
