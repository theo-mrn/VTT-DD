/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { Generateur } from '@vtt/rules';
import type { createService } from '@vtt/platform';
import type { CharacterConfig } from './config.js';
import type { Db } from './db/client.js';
import type { Catalogue } from './regles/catalogue.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: CharacterConfig;
  db: Db;
  /** Systèmes de jeu chargés, en cache. */
  catalogue: Catalogue;
  /** Générateur des jets tirés par le serveur (cryptographique, sauf en test). */
  aleatoire: () => Generateur;
  /** Horloge (date inscrite au journal des achats). */
  maintenant: () => Date;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
