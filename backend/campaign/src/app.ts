import { createService, type ServiceOptions } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import { characterAbsent, clientCharacter } from './clients/character.js';
import { clientProfils, sansProfils } from './clients/profils.js';
import type { CampaignConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { register as combat } from './modules/combat/index.js';
import { register as interne } from './modules/interne/index.js';
import { register as invitations } from './modules/invitations/index.js';
import { register as personnages } from './modules/personnages/index.js';
import { register as salles } from './modules/salles/index.js';
import { catalogueReference, type Catalogue } from './systemes/catalogue.js';

export async function buildCampaign(
  config: CampaignConfig,
  extra: Omit<ServiceOptions, 'config'> &
    Partial<Pick<Deps, 'maintenant' | 'character' | 'profils'>> & {
      db?: Db;
      catalogue?: Catalogue;
    } = {},
) {
  const { db: dbFourni, catalogue, maintenant, character, profils, ...options } = extra;
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
    catalogue: catalogue ?? catalogueReference(),
    character: character ?? clientCharacterDe(config, app.log),
    profils:
      profils ??
      (config.IDENTITY_URL
        ? clientProfils({
            url: config.IDENTITY_URL,
            cache: app.cache,
            signaler: (e) => app.log.warn({ erreur: (e as Error).message }, 'profil indisponible'),
          })
        : sansProfils),
    maintenant: maintenant ?? (() => new Date()),
  };

  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [salles, invitations, personnages, combat, interne]) {
    await module(app, deps);
  }

  return app;
}

function clientCharacterDe(config: CampaignConfig, log: { warn: (m: string) => void }) {
  if (!config.CHARACTER_URL || !config.INTERNAL_API_SECRET) {
    log.warn('CHARACTER_URL ou INTERNAL_API_SECRET absent : engagement et combat indisponibles');
    return characterAbsent;
  }
  return clientCharacter({ url: config.CHARACTER_URL, secret: config.INTERNAL_API_SECRET });
}
