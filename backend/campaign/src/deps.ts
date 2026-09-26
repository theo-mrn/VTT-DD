/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { createService } from '@vtt/platform';
import type { ClientCharacter } from './clients/character.js';
import type { ClientProfils } from './clients/profils.js';
import type { CampaignConfig } from './config.js';
import type { Db } from './db/client.js';
import type { Signataire } from './stockage/images.js';
import type { Catalogue } from './systemes/catalogue.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: CampaignConfig;
  db: Db;
  /** Systèmes de jeu connus (identité et initiative). */
  catalogue: Catalogue;
  /** Service character (routes internes). */
  character: ClientCharacter;
  /** Noms et avatars des membres (identity). */
  profils: ClientProfils;
  /** Horloge (expiration des invitations, sessions à venir). */
  maintenant: () => Date;
  /** URL d'envoi des images de salle ; absent si le stockage n'est pas configuré. */
  signataire: Signataire | undefined;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
