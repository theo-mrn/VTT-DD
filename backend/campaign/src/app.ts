import { createService, type ServiceOptions } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import { characterClient, characterUnavailable } from './clients/character.js';
import { noProfiles, profilesClient } from './clients/profiles.js';
import type { CampaignConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { register as campaigns } from './modules/campaigns/index.js';
import { register as characters } from './modules/characters/index.js';
import { register as combat } from './modules/combat/index.js';
import { register as internal } from './modules/internal/index.js';
import { register as invitations } from './modules/invitations/index.js';
import { register as maps } from './modules/maps/index.js';
import { register as messages } from './modules/messages/index.js';
import { register as sessions } from './modules/sessions/index.js';
import { createS3Signer } from './storage/images.js';
import { referenceCatalog, type Catalog } from './systems/catalog.js';

export async function buildCampaign(
  config: CampaignConfig,
  extra: Omit<ServiceOptions, 'config'> &
    Partial<Pick<Deps, 'now' | 'character' | 'profiles' | 'signer'>> & {
      db?: Db;
      catalog?: Catalog;
    } = {},
) {
  const { db: providedDb, catalog, now, character, profiles, signer, ...options } = extra;
  if (!config.JWKS_URL && !options.authKeyResolver) {
    throw new Error('Configuration invalide : JWKS_URL est requis pour vérifier les jetons');
  }
  const connection = providedDb ? null : createDb(config.DATABASE_URL);
  const db = providedDb ?? connection!.db;

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
    onShutdown: [...(options.onShutdown ?? []), async () => connection?.pool.end()],
  });

  const deps: Deps = {
    config,
    db,
    catalog: catalog ?? referenceCatalog(),
    character: character ?? characterClientFor(config, app.log),
    profiles:
      profiles ??
      (config.IDENTITY_URL
        ? profilesClient({
            url: config.IDENTITY_URL,
            cache: app.cache,
            onError: (e) => app.log.warn({ error: (e as Error).message }, 'profil indisponible'),
          })
        : noProfiles),
    now: now ?? (() => new Date()),
    signer: signer ?? createS3Signer(config),
  };

  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [
    campaigns,
    invitations,
    characters,
    combat,
    maps,
    sessions,
    messages,
    internal,
  ]) {
    await module(app, deps);
  }

  return app;
}

function characterClientFor(config: CampaignConfig, log: { warn: (m: string) => void }) {
  if (!config.CHARACTER_URL || !config.INTERNAL_API_SECRET) {
    log.warn('CHARACTER_URL ou INTERNAL_API_SECRET absent : engagement et combat indisponibles');
    return characterUnavailable;
  }
  return characterClient({ url: config.CHARACTER_URL, secret: config.INTERNAL_API_SECRET });
}
