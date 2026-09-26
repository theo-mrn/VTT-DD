import { createService, type ServiceOptions } from '@vtt/platform';
import { aleatoireCrypto } from '@vtt/rules';
import { sql } from 'drizzle-orm';
import type { CharacterConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { droitsCampaign, sansSalles } from './droits/campaign.js';
import { register as interne } from './modules/interne/index.js';
import { register as personnages } from './modules/personnages/index.js';
import { register as systemes } from './modules/systemes/index.js';
import { catalogueReference, type Catalogue } from './regles/catalogue.js';

export async function buildCharacter(
  config: CharacterConfig,
  extra: Omit<ServiceOptions, 'config'> &
    Partial<Pick<Deps, 'aleatoire' | 'maintenant' | 'droits'>> & {
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
    ...options
  } = extra;
  if (!config.JWKS_URL && !options.authKeyResolver) {
    throw new Error('Configuration invalide : JWKS_URL est requis pour vérifier les jetons');
  }
  const connexion = dbFourni ? null : createDb(config.DATABASE_URL);
  const db = dbFourni ?? connexion!.db;

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
    catalogue: catalogueFourni ?? catalogueReference(),
    aleatoire: aleatoire ?? aleatoireCrypto,
    maintenant: maintenant ?? (() => new Date()),
    droits: droits ?? droitsDesSalles(config, app.log),
  };

  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [systemes, personnages, interne]) {
    await module(app, deps);
  }

  return app;
}

/** Droits des MJ et joueurs des salles : campaign s'il est configuré, sinon propriétaire seul. */
function droitsDesSalles(config: CharacterConfig, log: { warn: (o: object, m: string) => void }) {
  if (!config.CAMPAIGN_URL || !config.INTERNAL_API_SECRET) {
    log.warn(
      {},
      'CAMPAIGN_URL ou INTERNAL_API_SECRET absent : seul le propriétaire accède à un personnage',
    );
    return sansSalles;
  }
  return droitsCampaign({
    url: config.CAMPAIGN_URL,
    secret: config.INTERNAL_API_SECRET,
    cacheMs: config.DROITS_CACHE_MS,
    signaler: (erreur) =>
      log.warn({ erreur: (erreur as Error).message }, 'campaign injoignable : droits refusés'),
  });
}
