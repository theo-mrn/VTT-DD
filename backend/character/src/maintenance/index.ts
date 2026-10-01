/**
 * Entretien périodique de character (docs/nettoyage.md) : une passe toutes les
 * CLEANUP_EVERY_MINUTES, faite par une seule instance (verrou consultatif).
 */
import { uuidv7 } from '@vtt/contracts';
import { periodic, withAdvisoryLock, type Logger } from '@vtt/platform';
import type { CharacterConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { purge } from './purge.js';

export function startMaintenance(config: CharacterConfig, logger: Logger): () => Promise<void> {
  if (!config.CLEANUP_EVERY_MINUTES) return async () => undefined;
  const { db, pool } = createDb(config.DATABASE_URL);
  const stop = periodic({
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
  });
  return async () => {
    await stop();
    await pool.end().catch(() => undefined);
  };
}
