import cookie from '@fastify/cookie';
import { createService, type ServiceOptions } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import { createLocalJWKSet } from 'jose';
import { firebaseParams, type IdentityConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { createMailer, type Mailer } from './mail/mailer.js';
import { register as amis } from './modules/amis/index.js';
import { register as clesApi } from './modules/cles-api/index.js';
import { register as oauth } from './modules/oauth/index.js';
import { register as profil } from './modules/profil/index.js';
import { register as securite } from './modules/securite/index.js';
import { register as titres } from './modules/titres/index.js';
import { pgSessionStore } from './db/session-store.js';
import { creerClientFirebase, type ClientFirebase } from './import/firebase-jit.js';
import { registerAuthRoutes } from './routes/auth.js';
import { createJwtSigner } from './tokens/jwt.js';

export async function buildIdentity(
  config: IdentityConfig,
  extra: Omit<ServiceOptions, 'config' | 'authKeyResolver'> & {
    db?: Db;
    mailer?: Mailer;
    /** Client Firebase simulé (tests) pour la migration à la connexion. */
    migrationFirebase?: ClientFirebase;
  } = {},
) {
  const { db: dbFourni, mailer: mailerFourni, migrationFirebase, ...options } = extra;
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

  const deps: Deps = {
    config,
    db,
    sessions: pgSessionStore(db),
    signer,
    firebase,
    mailer:
      mailerFourni ??
      createMailer({ smtpUrl: config.SMTP_URL, from: config.MAIL_FROM, log: app.log }),
  };

  await registerAuthRoutes(app, {
    db,
    sessions: deps.sessions,
    signer,
    firebase,
    cookieSecure: config.COOKIE_SECURE,
    migrationFirebase:
      migrationFirebase ??
      (config.FIREBASE_WEB_API_KEY && config.FIREBASE_PROJECT_ID
        ? creerClientFirebase({
            apiKey: config.FIREBASE_WEB_API_KEY,
            projectId: config.FIREBASE_PROJECT_ID,
          })
        : undefined),
  });

  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [securite, oauth, profil, titres, amis, clesApi]) {
    await module(app, deps);
  }

  return app;
}
