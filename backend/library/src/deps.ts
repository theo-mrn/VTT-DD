/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { createService } from '@vtt/platform';
import type { LibraryConfig } from './config.js';
import type { Db } from './db/client.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: LibraryConfig;
  db: Db;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
