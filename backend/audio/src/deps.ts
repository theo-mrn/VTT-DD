/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { createService } from '@vtt/platform';
import type { Catalog } from './catalog/index.js';
import type { CampaignRights } from './clients/campaign.js';
import type { AudioConfig } from './config.js';
import type { Db } from './db/client.js';
import type { AudioStorage } from './storage/s3.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: AudioConfig;
  db: Db;
  /** Rôle de l'appelant dans une campagne (campaign). */
  campaigns: CampaignRights;
  /** Fichiers (R2) ; undefined : envoi et lecture des envois indisponibles. */
  storage: AudioStorage | undefined;
  catalog: Catalog;
  /** Horloge du serveur (ms) : la seule qui fait foi. Injectable en test. */
  now: () => number;
  random: () => number;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
