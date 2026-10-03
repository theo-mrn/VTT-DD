/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { Generateur } from '@vtt/rules';
import type { createService, Uploads } from '@vtt/platform';
import type { CharacterConfig } from './config.js';
import type { Db } from './db/client.js';
import type { JournalDes } from './des/dice.js';
import type { DroitsCampagnes } from './droits/campaign.js';
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
  /** Droits sur les personnages des autres, décidés par les campagnes de campaign. */
  droits: DroitsCampagnes;
  /** Envoi de fichiers (portraits) vers le stockage : billets signés (docs/uploads.md). */
  uploads: Uploads;
  /** Historique des jets (service dice) : reçoit chaque jet d'action. */
  des: JournalDes;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
