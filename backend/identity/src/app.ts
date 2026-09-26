import cookie from '@fastify/cookie';
import { createService, type ServiceOptions } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import { createLocalJWKSet } from 'jose';
import { firebaseParams, type IdentityConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import { pgSessionStore } from './db/session-store.js';
import { registerAuthRoutes } from './routes/auth.js';
import { createJwtSigner } from './tokens/jwt.js';

export async function buildIdentity(
  config: IdentityConfig,
  extra: Omit<ServiceOptions, 'config' | 'authKeyResolver'> & { db?: Db } = {},
) {
  const { db: dbFourni, ...options } = extra;
  const connexion = dbFourni ? null : createDb(config.DATABASE_URL);
  const db = dbFourni ?? connexion!.db;

  const signer = await createJwtSigner({
    privateJwks: config.JWT_PRIVATE_JWKS,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  });

  const app = await createService({
    config,
    ...options,
    // identity vérifie ses propres jetons sans appel réseau
    authKeyResolver: createLocalJWKSet(signer.jwks()),
    readiness: {
      postgres: async () => {
        await db.execute(sql`select 1`);
        return true;
      },
      ...options.readiness,
    },
    onShutdown: [...(options.onShutdown ?? []), async () => connexion?.pool.end()],
  });

  await app.register(cookie);

  const firebase = firebaseParams(config);
  if (!firebase) {
    app.log.warn(
      'paramètres scrypt Firebase absents : les comptes importés ne pourront pas se connecter',
    );
  }

  await registerAuthRoutes(app, {
    db,
    sessions: pgSessionStore(db),
    signer,
    firebase,
    cookieSecure: config.COOKIE_SECURE,
  });

  return app;
}
