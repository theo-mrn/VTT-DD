/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { createService } from '@vtt/platform';
import type { CampaignRights } from './clients/campaign.js';
import type { HistoryConfig } from './config.js';
import type { Db } from './db/client.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: HistoryConfig;
  db: Db;
  /** Rôle de l'appelant dans une campagne (campaign). */
  campaigns: CampaignRights;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
