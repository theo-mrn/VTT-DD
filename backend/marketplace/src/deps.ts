/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { createService, Uploads } from '@vtt/platform';
import type { BillingCheckout } from './clients/billing.js';
import type { CampaignRights } from './clients/campaign.js';
import type { MarketplaceConfig } from './config.js';
import type { Db } from './db/client.js';
import type { PackStorage } from './storage/storage.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: MarketplaceConfig;
  db: Db;
  /** Rôle de l'appelant dans une campagne (installation : MJ seulement). */
  campaigns: CampaignRights;
  /** Sessions de vente (billing). */
  billing: BillingCheckout;
  /** Fichiers des packs ; undefined : envoi de contenu indisponible (503). */
  storage: PackStorage | undefined;
  /** Billets d'envoi de la couverture et de la galerie. */
  uploads: Uploads;
  now: () => Date;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
