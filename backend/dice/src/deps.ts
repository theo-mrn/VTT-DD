/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { createService } from '@vtt/platform';
import type { Generateur } from '@vtt/rules';
import type { CampaignRights } from './clients/campaign.js';
import type { CharacterClient } from './clients/character.js';
import type { ProfilesClient } from './clients/profiles.js';
import type { DiceConfig } from './config.js';
import type { Db } from './db/client.js';
import type { Catalog } from './systems/catalog.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: DiceConfig;
  db: Db;
  /** Systèmes de jeu connus (dés à symboles). */
  catalog: Catalog;
  /** Rôle de l'appelant dans une campagne (campaign). */
  campaigns: CampaignRights;
  /** Fiche d'un personnage (character). */
  characters: CharacterClient;
  /** Noms et avatars des auteurs (identity). */
  profiles: ProfilesClient;
  /** Générateur des jets tirés par le serveur (cryptographique, sauf en test). */
  random: () => Generateur;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
