/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { createService } from '@vtt/platform';
import type { IdentityConfig } from './config.js';
import type { Db } from './db/client.js';
import type { Mailer } from './mail/mailer.js';
import type { FirebaseScryptParams } from './passwords/firebase-scrypt.js';
import type { JwtSigner } from './tokens/jwt.js';
import type { SessionStore } from './tokens/refresh.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: IdentityConfig;
  db: Db;
  sessions: SessionStore;
  signer: JwtSigner;
  mailer: Mailer;
  firebase: FirebaseScryptParams | undefined;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
