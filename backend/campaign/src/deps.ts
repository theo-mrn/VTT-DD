import type { ObjectStore, PlacesChecker, Uploads } from '@vtt/platform';
/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { createService } from '@vtt/platform';
import type { CharacterClient } from './clients/character.js';
import type { ProfilesClient } from './clients/profiles.js';
import type { CampaignConfig } from './config.js';
import type { Db } from './db/client.js';
import type { UploadSigner } from './storage/images.js';
import type { Catalog } from './systems/catalog.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: CampaignConfig;
  db: Db;
  /** Systèmes de jeu connus (identité et initiative). */
  catalog: Catalog;
  /** Service character (routes internes). */
  character: CharacterClient;
  /** Noms et avatars des membres (identity). */
  profiles: ProfilesClient;
  /** Horloge (expiration des invitations, sessions à venir). */
  now: () => Date;
  /** URL d'envoi des images de campagne ; absent si le stockage n'est pas configuré. */
  signer: UploadSigner | undefined;
  /** Envoi de fichiers, brique commune (`POST …/uploads`, docs/uploads.md). */
  uploads: Uploads;
  /** Stockage des campagnes (docs/stockage.md) : listage, suppression ; absent sans S3. */
  store: ObjectStore | undefined;
  /** Où sert chaque fichier : tables qui le citent, ce service et les autres. */
  places: PlacesChecker;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
