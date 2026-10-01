/**
 * Entretien périodique de character (docs/nettoyage.md) : purge de la corbeille toutes les
 * CLEANUP_EVERY_MINUTES et balayage des fichiers orphelins de characters/, chacun fait par une
 * seule instance (verrou consultatif).
 */
import { uuidv7 } from '@vtt/contracts';
import { periodic, startOrphanSweep, withAdvisoryLock, type Logger } from '@vtt/platform';
import type { CharacterConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { purge } from './purge.js';

export function startMaintenance(config: CharacterConfig, logger: Logger): () => Promise<void> {
  const purgeOn = config.CLEANUP_EVERY_MINUTES > 0;
  if (!purgeOn && config.ORPHAN_SWEEP === 'off') return async () => undefined;
  const { db, pool } = createDb(config.DATABASE_URL);
  const stops = [
    purgeOn
      ? periodic({
          name: 'character-cleanup',
          everyMs: config.CLEANUP_EVERY_MINUTES * 60_000,
          logger,
          run: async () => {
            await withAdvisoryLock(pool, 'character-cleanup', async () => {
              await purge({
                db,
                ctx: { correlationId: uuidv7() },
                dryRun: config.CLEANUP_DRY_RUN,
                log: logger,
              });
            });
          },
        })
      : async () => undefined,
    // Fichiers orphelins de characters/ (essai par défaut : ORPHAN_SWEEP)
    startOrphanSweep({
      name: 'character-orphans',
      pool,
      schema: 'characters',
      prefixes: ['characters/'],
      settings: config,
      logger,
    }),
  ];
  return async () => {
    await Promise.all(stops.map((stop) => stop()));
    await pool.end().catch(() => undefined);
  };
}
