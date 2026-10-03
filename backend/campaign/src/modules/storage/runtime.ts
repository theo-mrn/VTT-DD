/**
 * Ce qui fait tourner l'inventaire du stockage (docs/stockage.md) : la question « où sert ce
 * fichier ? » posée à tous les services, et la passe horaire sur toutes les campagnes.
 */
import {
  createObjectStore,
  periodic,
  referencePlaces,
  remotePlaces,
  withAdvisoryLock,
  type Logger,
  type PlacesChecker,
} from '@vtt/platform';
import type pg from 'pg';
import type { CampaignConfig } from '../../config.js';
import { createDb } from '../../db/client.js';
import { campaigns } from '../../db/schema.js';
import { inventoryCampaign } from './ledger.js';

/**
 * Où sert un fichier : les tables de ce service, et celles des services de
 * `STORAGE_REFERENCE_URLS` (les mêmes que la passe des orphelins). Un service injoignable fait
 * échouer la question : l'inventaire garde alors le dernier état connu.
 */
export function placesChecker(config: CampaignConfig, pool: pg.Pool): PlacesChecker {
  const secret = config.INTERNAL_API_SECRET;
  const others = secret
    ? (config.STORAGE_REFERENCE_URLS ?? []).map((url) => remotePlaces(url, secret))
    : [];
  return async (keys) => {
    const all = await Promise.all([
      referencePlaces(pool, 'campaign', keys),
      ...others.map((check) => check(keys)),
    ]);
    const merged: Record<string, string[]> = {};
    for (const one of all)
      for (const [key, tables] of Object.entries(one))
        merged[key] = [...(merged[key] ?? []), ...tables];
    return merged;
  };
}

const NAME = 'campaign-storage-inventory';

/** Inventaire de toutes les campagnes, toutes les `STORAGE_INVENTORY_EVERY_MINUTES` (une instance). */
export function startStorageInventory(
  config: CampaignConfig,
  logger: Pick<Logger, 'info' | 'warn' | 'error'>,
): () => Promise<void> {
  const store = createObjectStore(config);
  if (!store) {
    logger.warn('inventaire du stockage désactivé : stockage non configuré');
    return async () => undefined;
  }
  const { db, pool } = createDb(config.DATABASE_URL);
  const places = placesChecker(config, pool);
  const stop = periodic({
    name: NAME,
    everyMs: config.STORAGE_INVENTORY_EVERY_MINUTES * 60_000,
    logger,
    run: async () => {
      await withAdvisoryLock(pool, NAME, async () => {
        const ids = await db.select({ id: campaigns.id }).from(campaigns);
        let failed = 0;
        for (const { id } of ids)
          try {
            await inventoryCampaign({ db, store, places, now: () => new Date() }, id);
          } catch (err) {
            failed += 1;
            logger.warn({ err, campaignId: id }, 'inventaire du stockage impossible');
          }
        logger.info({ campaigns: ids.length, failed }, 'inventaire du stockage');
      });
    },
  });
  return async () => {
    await stop();
    await pool.end().catch(() => undefined);
  };
}
