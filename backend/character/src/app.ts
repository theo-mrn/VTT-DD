import {
  createService,
  registerStorageReferences,
  type ServiceOptions,
  Uploads,
} from '@vtt/platform';
import type pg from 'pg';
import { aleatoireCrypto } from '@vtt/rules';
import { sql } from 'drizzle-orm';
import type { CharacterConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { journalDes, sansDes } from './des/dice.js';
import { droitsCampaign, sansCampagnes } from './droits/campaign.js';
import { register as interne } from './modules/interne/index.js';
import { register as personnages } from './modules/personnages/index.js';
import { register as systemes } from './modules/systemes/index.js';
import { register as templates } from './modules/templates/index.js';
import { catalogueReference, type Catalogue } from './regles/catalogue.js';

export async function buildCharacter(
  config: CharacterConfig,
  extra: Omit<ServiceOptions, 'config'> &
    Partial<Pick<Deps, 'aleatoire' | 'maintenant' | 'droits' | 'des' | 'uploads'>> & {
      db?: Db;
      catalogue?: Catalogue;
    } = {},
) {
  const {
    db: dbFourni,
    catalogue: catalogueFourni,
    aleatoire,
    maintenant,
    droits,
    des,
    uploads,
    ...options
  } = extra;
  if (!config.JWKS_URL && !options.authKeyResolver) {
    throw new Error('Configuration invalide : JWKS_URL est requis pour vérifier les jetons');
  }
  const connexion = dbFourni ? null : createDb(config.DATABASE_URL);
  const db = dbFourni ?? connexion!.db;

  // Systèmes compilés avant le serveur : la compilation (synchrone, ~1 s par système) bloquerait
  // sinon la boucle d'événements à la première requête, et la protection de charge du service
  // (under-pressure) renverrait 503 aux requêtes suivantes
  const catalogue = catalogueFourni ?? catalogueReference();
  for (const s of catalogue.lister()) catalogue.charge(s.id);

  const app = await createService({
    config,
    ...options,
    readiness: {
      postgres: async () => {
        await db.execute(sql`select 1`);
        return true;
      },
      ...options.readiness,
    },
    onShutdown: [...(options.onShutdown ?? []), async () => connexion?.pool.end()],
  });

  const deps: Deps = {
    config,
    db,
    catalogue,
    aleatoire: aleatoire ?? aleatoireCrypto,
    maintenant: maintenant ?? (() => new Date()),
    droits: droits ?? droitsDesCampagnes(config, app.log),
    des: des ?? journalDesJets(config, app.log),
    uploads: uploads ?? Uploads.fromSettings(config),
  };

  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [systemes, personnages, templates, interne]) {
    await module(app, deps);
  }

  // Fichiers encore référencés par ce service : le balayage des orphelins le demande à chacun
  registerStorageReferences(app, {
    pool: (db as Db & { $client: pg.Pool }).$client,
    schema: 'characters',
    secret: config.INTERNAL_API_SECRET,
  });

  return app;
}

/** Droits des MJ et joueurs des campagnes : campaign s'il est configuré, sinon propriétaire seul. */
function droitsDesCampagnes(
  config: CharacterConfig,
  log: { warn: (o: object, m: string) => void },
) {
  if (!config.CAMPAIGN_URL || !config.INTERNAL_API_SECRET) {
    log.warn(
      {},
      'CAMPAIGN_URL ou INTERNAL_API_SECRET absent : seul le propriétaire accède à un personnage',
    );
    return sansCampagnes;
  }
  return droitsCampaign({
    url: config.CAMPAIGN_URL,
    secret: config.INTERNAL_API_SECRET,
    cacheMs: config.DROITS_CACHE_MS,
    signaler: (erreur) =>
      log.warn(
        { erreur: (erreur as Error).message },
        'campaign injoignable : droits refusés, règles optionnelles par défaut',
      ),
  });
}

/** Jets d'action transmis à dice s'il est configuré ; un échec est journalisé, jamais bloquant. */
function journalDesJets(config: CharacterConfig, log: { warn: (o: object, m: string) => void }) {
  if (!config.DICE_URL || !config.INTERNAL_API_SECRET) {
    log.warn({}, "DICE_URL ou INTERNAL_API_SECRET absent : jets d'action absents de l'historique");
    return sansDes;
  }
  return journalDes({
    url: config.DICE_URL,
    secret: config.INTERNAL_API_SECRET,
    signaler: (erreur, jet) =>
      log.warn(
        { erreur: (erreur as Error).message, ...jet },
        "dice injoignable : jet d'action absent de l'historique",
      ),
  });
}
