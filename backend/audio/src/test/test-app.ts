/**
 * Service audio complet pour les tests : jetons signés par une clé du test,
 * faux campaign (serveur HTTP local), stockage en mémoire, horloge pilotée.
 * Branché sur le PostgreSQL de TEST_DATABASE_URL (rôle audio_svc) pour les
 * tests d'intégration. Chaque test utilise des campagnes neuves et supprime
 * ensuite leurs données : les tests peuvent tourner en même temps.
 */
import { loadConfig } from '@vtt/platform';
import { inArray, or, sql } from 'drizzle-orm';
import { generateKeyPair, SignJWT } from 'jose';
import { buildAudio } from '../app.js';
import type { CampaignRole } from '../clients/campaign.js';
import { AudioConfig } from '../config.js';
import { createDb } from '../db/client.js';
import {
  assets,
  channels,
  cues,
  jobs,
  legacyIds,
  mixerPreferences,
  outbox,
  playlists,
} from '../db/schema.js';
import { fakeCampaign } from './fake-campaign.js';
import { memoryStorage } from './memory-storage.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const SECRET = 'secret-interne-de-test-0123456789abcdef';
export const UPLOAD_SECRET = 'secret-d-envoi-de-test-0123456789abcdef';
const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

export async function testApp(overrides: Record<string, string> = {}) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const connection = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const campaign = await fakeCampaign(SECRET);
  const files = memoryStorage();
  const clock = { now: Date.now() };
  const config = loadConfig(AudioConfig, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL ?? 'postgres://absent@localhost:1/aucune',
    JWT_ISSUER: ISSUER,
    JWT_AUDIENCE: AUDIENCE,
    INTERNAL_API_SECRET: SECRET,
    CAMPAIGN_URL: campaign.url,
    RIGHTS_CACHE_MS: '0',
    AUDIO_UPLOAD_SECRET: UPLOAD_SECRET,
    AUDIO_CATALOG_PUBLISHED_URL: 'https://files.test/vtt/audio/catalog',
    CUE_LEAD_MS: '250',
    CHANNEL_START_LEAD_MS: '0',
    ...overrides,
  });
  const app = await buildAudio(config, {
    authKeyResolver: async () => publicKey,
    storage: files.storage,
    now: () => clock.now,
    random: () => 0.42,
    ...(connection ? { db: connection.db } : {}),
  });

  const campaigns: string[] = [];
  const users: string[] = [];

  const sign = (id: string) =>
    new SignJWT({ roles: ['user'] })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);

  async function user() {
    const id = crypto.randomUUID();
    users.push(id);
    return { id, auth: { authorization: `Bearer ${await sign(id)}` } };
  }

  /** Campagne neuve : un MJ, un joueur, un spectateur et un étranger. */
  async function table() {
    const [gm, player, spectator, stranger] = await Promise.all([user(), user(), user(), user()]);
    const roles: Record<string, CampaignRole> = {
      [gm.id]: 'gm',
      [player.id]: 'player',
      [spectator.id]: 'spectator',
    };
    const id = campaign.campaign(roles);
    campaigns.push(id);
    return { id, gm, player, spectator, stranger };
  }

  async function close() {
    await app.close();
    await campaign.close();
    if (connection) {
      const db = connection.db;
      if (campaigns.length) {
        await db.delete(cues).where(inArray(cues.campaignId, campaigns));
        await db.delete(channels).where(inArray(channels.campaignId, campaigns));
        await db.delete(playlists).where(inArray(playlists.campaignId, campaigns));
        const ids = db
          .select({ id: assets.id })
          .from(assets)
          .where(inArray(assets.campaignId, campaigns));
        await db.delete(jobs).where(inArray(jobs.assetId, ids));
        await db.delete(legacyIds).where(inArray(legacyIds.targetId, ids));
        await db.delete(assets).where(inArray(assets.campaignId, campaigns));
        await db
          .delete(outbox)
          .where(
            or(
              inArray(sql`${outbox.envelope}->>'roomId'`, campaigns),
              inArray(sql`${outbox.envelope}->'actor'->>'userId'`, users),
            ),
          );
      }
      if (users.length)
        await db.delete(mixerPreferences).where(inArray(mixerPreferences.userId, users));
      await connection.pool.end();
    }
  }

  return { app, db: connection?.db, campaign, files, clock, config, user, table, close };
}

export type TestContext = Awaited<ReturnType<typeof testApp>>;
export type TestUser = Awaited<ReturnType<TestContext['user']>>;

/** Raccourcis HTTP. */
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

  /** Événements de l'outbox d'une campagne (ou d'un utilisateur), dans l'ordre. */
  async function events(roomOrUser: string) {
    const rows = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        or(
          sql`${outbox.envelope}->>'roomId' = ${roomOrUser}`,
          sql`${outbox.envelope}->'aggregate'->>'id' = ${roomOrUser}`,
        ),
      )
      .orderBy(outbox.createdAt, outbox.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r) => r.envelope as Record<string, any>);
  }

  return { request, ok, events };
}
