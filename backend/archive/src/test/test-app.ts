/**
 * Service archive complet pour les tests : jetons signés par une clé du test, campaign,
 * character et audio simulés, stockage en mémoire. Branché sur le PostgreSQL de
 * TEST_DATABASE_URL (rôle archive_svc). Chaque test crée ses comptes et efface ensuite leurs
 * tâches : les tests tournent en parallèle sans toucher au reste de la base.
 */
import { loadConfig } from '@vtt/platform';
import { inArray, sql } from 'drizzle-orm';
import { generateKeyPair, SignJWT } from 'jose';
import { buildArchive } from '../app.js';
import type { ArchiveServices } from '../clients/services.js';
import { ArchiveConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { inbox, jobs, outbox } from '../db/schema.js';
import { memoryStore } from './memory-store.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

export async function testApp(services: ArchiveServices, overrides: Record<string, string> = {}) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const connection = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const files = memoryStore();
  const users: string[] = [];
  let now = new Date();
  const config = loadConfig(ArchiveConfig, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL ?? 'postgres://absent@localhost:1/aucune',
    JWT_ISSUER: ISSUER,
    JWT_AUDIENCE: AUDIENCE,
    ...overrides,
  });
  const app = await buildArchive(config, {
    authKeyResolver: async () => publicKey,
    services,
    store: files.store,
    now: () => now,
    ...(connection ? { db: connection.db } : {}),
  });

  async function user(roles: string[] = ['user']) {
    const id = crypto.randomUUID();
    users.push(id);
    const token = await new SignJWT({ roles })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);
    return { id, auth: { authorization: `Bearer ${token}` } };
  }

  async function close() {
    await app.close();
    if (connection && users.length) {
      const db = connection.db;
      const ids = (
        await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.userId, users))
      ).map((j) => j.id);
      await db.delete(outbox).where(inArray(sql`${outbox.envelope}->'actor'->>'userId'`, users));
      if (ids.length)
        await db.delete(outbox).where(inArray(sql`${outbox.envelope}->'aggregate'->>'id'`, ids));
      await db.delete(outbox).where(inArray(sql`${outbox.envelope}->'aggregate'->>'id'`, users));
      await db.delete(jobs).where(inArray(jobs.userId, users));
      await db.delete(inbox).where(inArray(inbox.consumer, ['test-archive']));
      await connection.pool.end();
    }
  }

  return {
    app,
    deps: app.deps,
    files,
    user,
    close,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

export type TestContext = Awaited<ReturnType<typeof testApp>>;
export type TestUser = Awaited<ReturnType<TestContext['user']>>;
