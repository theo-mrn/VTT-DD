/**
 * Service library complet pour les tests : jetons signés par une clé du test, branché sur le
 * PostgreSQL de TEST_DATABASE_URL (rôle library_svc). Chaque test écrit ses lieux sous une
 * source à lui et les supprime ensuite : les tests tournent en parallèle sans rien toucher
 * d'autre dans la base.
 */
import { loadConfig } from '@vtt/platform';
import { eq } from 'drizzle-orm';
import { generateKeyPair, SignJWT } from 'jose';
import { buildLibrary } from '../app.js';
import { LibraryConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { backgrounds } from '../db/schema.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

export async function testApp() {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const connection = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const config = loadConfig(LibraryConfig, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL ?? 'postgres://absent@localhost:1/aucune',
    JWT_ISSUER: ISSUER,
    JWT_AUDIENCE: AUDIENCE,
  });
  const app = await buildLibrary(config, {
    authKeyResolver: async () => publicKey,
    ...(connection ? { db: connection.db } : {}),
  });
  /** Source propre au test : ses lignes sont supprimées à la fermeture. */
  const source = `test-${crypto.randomUUID().slice(0, 8)}`;
  const token = await new SignJWT({ roles: ['user'] })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(crypto.randomUUID())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime('5m')
    .sign(privateKey);

  async function close() {
    await app.close();
    if (connection) {
      await connection.db.delete(backgrounds).where(eq(backgrounds.source, source));
      await connection.pool.end();
    }
  }

  return { app, db: connection?.db, source, auth: { authorization: `Bearer ${token}` }, close };
}
export type TestContext = Awaited<ReturnType<typeof testApp>>;
