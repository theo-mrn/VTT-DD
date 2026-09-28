/**
 * Service campaign complet pour les tests, avec des jetons signés par une
 * clé générée pour le test (comme ceux d'identity) et un faux character
 * (serveur HTTP local). Branché sur le PostgreSQL de TEST_DATABASE_URL (rôle
 * campaign_svc) pour les tests d'intégration. Chaque test utilise des
 * utilisateurs neufs et supprime ensuite leurs campagnes : les tests peuvent
 * tourner en même temps sur la même base.
 */
import { loadConfig } from '@vtt/platform';
import { inArray, sql } from 'drizzle-orm';
import { generateKeyPair, SignJWT } from 'jose';
import { buildCampaign } from '../app.js';
import type { ProfilesClient } from '../clients/profiles.js';
import { CampaignConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { campaigns, outbox } from '../db/schema.js';
import type { SignatureRequest } from '../storage/images.js';
import type { Catalog } from '../systems/catalog.js';
import { fakeCharacter } from './fake-character.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const SECRET = 'secret-interne-de-test-0123456789abcdef';

const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

export async function testApp(
  overrides: Record<string, string> = {},
  /** Catalogue de systèmes à la place des systèmes de référence (règles optionnelles…). */
  extra: { catalog?: Catalog } = {},
) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const connection = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const character = await fakeCharacter(SECRET);
  let offsetMs = 0;
  const names = new Map<string, string>();
  const profiles: ProfilesClient = {
    profiles: async (ids) =>
      new Map(ids.map((id) => [id, { name: names.get(id) ?? null, avatarUrl: null }])),
  };
  // Faux stockage : URL d'envoi « signée » sans appel réseau, demandes gardées
  const uploads: SignatureRequest[] = [];
  const signer = async (r: SignatureRequest) => {
    uploads.push(r);
    return `https://s3.test.local/vtt/${r.key}?X-Amz-Signature=faux`;
  };

  const app = await buildCampaign(
    loadConfig(CampaignConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL ?? 'postgres://absent@localhost:1/aucune',
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      INTERNAL_API_SECRET: SECRET,
      CHARACTER_URL: character.url,
      APP_URL: 'https://jeu.test.local',
      S3_PUBLIC_URL: 'https://cdn.test.local/vtt/',
      ...overrides,
    }),
    {
      authKeyResolver: async () => publicKey,
      now: () => new Date(Date.now() + offsetMs),
      profiles,
      signer,
      ...(extra.catalog ? { catalog: extra.catalog } : {}),
      ...(connection ? { db: connection.db } : {}),
    },
  );

  const users: string[] = [];

  /** Nouvel utilisateur (identifiant aléatoire) et son en-tête d'autorisation. */
  async function user(name?: string) {
    const id = crypto.randomUUID();
    users.push(id);
    if (name) names.set(id, name);
    const token = await new SignJWT({ roles: ['user'] })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);
    return { id, auth: { authorization: `Bearer ${token}` } };
  }

  /** Avance l'horloge du service (expiration des invitations). */
  const advance = (ms: number) => {
    offsetMs += ms;
  };

  async function close() {
    await app.close();
    await character.close();
    if (connection && users.length) {
      const db = connection.db;
      const ids = (
        await db
          .select({ id: campaigns.id })
          .from(campaigns)
          .where(inArray(campaigns.ownerId, users))
      ).map((c) => c.id);
      if (ids.length) {
        await db.delete(outbox).where(inArray(sql`${outbox.envelope}->>'roomId'`, ids));
        await db.delete(campaigns).where(inArray(campaigns.id, ids));
      }
      // Événements des campagnes déjà supprimées par le test lui-même
      await db.delete(outbox).where(inArray(sql`${outbox.envelope}->'actor'->>'userId'`, users));
    }
    await connection?.pool.end();
  }

  return { app, db: connection?.db, character, uploads, user, advance, close };
}

export type TestContext = Awaited<ReturnType<typeof testApp>>;
export type TestUser = Awaited<ReturnType<TestContext['user']>>;

/** Raccourcis HTTP : requête brute, ou requête qui doit réussir. */
export function helpers(t: TestContext) {
  type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  const request = (u: TestUser, method: Method, url: string, payload?: unknown) =>
    t.app.inject({
      method,
      url,
      headers: u.auth,
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });

  async function ok<T = Record<string, unknown>>(
    u: TestUser,
    method: Method,
    url: string,
    payload?: unknown,
  ): Promise<T> {
    const res = await request(u, method, url, payload);
    if (res.statusCode >= 300) throw new Error(`${method} ${url} : ${res.statusCode} ${res.body}`);
    return (res.body ? res.json() : undefined) as T;
  }

  /** Campagne créée par `gm`, avec des joueurs invités (rôle player). */
  async function campaign(gm: TestUser, systemId = 'dnd-classic', players: TestUser[] = []) {
    const c = await ok<{ id: string }>(gm, 'POST', '/v1/campaigns', { name: 'La Table', systemId });
    if (players.length) {
      const { code } = await ok<{ code: string }>(
        gm,
        'POST',
        `/v1/campaigns/${c.id}/invitations`,
        {},
      );
      for (const p of players) await ok(p, 'POST', '/v1/campaigns/join', { code });
    }
    return c.id;
  }

  /** Personnage du faux character engagé dans la campagne par son propriétaire. */
  async function engage(
    campaignId: string,
    u: TestUser,
    c: { side?: string; systemId?: string } & Omit<
      Parameters<TestContext['character']['add']>[0],
      'ownerId' | 'systemId'
    > = {},
  ) {
    const { side, systemId = 'dnd-classic', ...rest } = c;
    const id = t.character.add({ ownerId: u.id, systemId, ...rest });
    await ok(u, 'POST', `/v1/campaigns/${campaignId}/characters`, {
      characterId: id,
      ...(side ? { side } : {}),
    });
    return id;
  }

  /** `u` incarne le personnage dans la campagne (droits d'écriture, tours de combat). */
  const play = (campaignId: string, u: TestUser, characterId: string | null) =>
    ok(u, 'PUT', `/v1/campaigns/${campaignId}/me/character`, { characterId });

  return { request, ok, campaign, engage, play };
}
