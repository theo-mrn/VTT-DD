/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { createService } from '@vtt/platform';
import type { ArchiveServices } from './clients/services.js';
import type { ArchiveConfig } from './config.js';
import type { Db } from './db/client.js';
import type { ArchiveStore } from './storage/store.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: ArchiveConfig;
  db: Db;
  /** campaign, character et audio (routes internes) ; undefined : export et import indisponibles. */
  services: ArchiveServices | undefined;
  /** Archives et fichiers (R2) ; undefined : export et import indisponibles. */
  store: ArchiveStore | undefined;
  now: () => Date;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
