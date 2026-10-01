/**
 * Purge définitive (docs/nettoyage.md) : personnages restés plus de `TRASH_DAYS` jours dans la
 * corbeille, instances de PNJ supprimées dès la passe suivante (leur modèle demeure). Les modèles
 * ne sont jamais touchés : seul le MJ les supprime.
 * La ligne part (les tables liées suivent par ON DELETE CASCADE) avec son `*.purged` dans
 * l'outbox. Aucun fichier n'est supprimé ici : une image se partage (la copie d'un PNJ reprend
 * le portrait de l'original), seule la passe des fichiers orphelins,
 * qui vérifie que plus rien ne la référence, la supprime.
 */
import { TRASH_DAYS } from '@vtt/contracts';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { appendEvent, type EventContext } from '../db/outbox.js';
import { characters } from '../db/schema.js';

export const PURGE_BATCH = 50;

const SYSTEM = { userId: null, role: 'system', characterId: null } as const;

/** Instance de PNJ supprimée, ou personnage supprimé depuis plus de TRASH_DAYS jours. */
const due = or(
  and(isNotNull(characters.deletedAt), eq(characters.kind, 'npc')),
  and(
    isNotNull(characters.deletedAt),
    sql`${characters.deletedAt} <= now() - make_interval(days => ${TRASH_DAYS})`,
  ),
);

interface Options {
  db: Db;
  ctx: EventContext;
  /** Journalise ce qui serait purgé, sans rien supprimer. */
  dryRun?: boolean;
  log?: { info: (o: object, m: string) => void };
}

/** Une passe complète, par lots ; renvoie le nombre de personnages purgés. */
export async function purge(o: Options): Promise<number> {
  if (o.dryRun) {
    const [row] = await o.db
      .select({ count: sql<number>`count(*)::int` })
      .from(characters)
      .where(due);
    o.log?.info({ characters: row!.count }, 'purge (essai) : rien supprimé');
    return 0;
  }
  let total = 0;
  for (;;) {
    const n = await purgeBatch(o.db, o.ctx);
    total += n;
    if (n < PURGE_BATCH) break;
  }
  if (total) o.log?.info({ characters: total }, 'purge définitive');
  return total;
}

/** Un lot ; SKIP LOCKED : une écriture en cours n'est pas attendue. */
function purgeBatch(db: Db, ctx: EventContext): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: characters.id, campaignId: characters.campaignId, kind: characters.kind })
      .from(characters)
      .where(due)
      .limit(PURGE_BATCH)
      .for('update', { skipLocked: true });
    if (!rows.length) return 0;
    await tx.delete(characters).where(
      inArray(
        characters.id,
        rows.map((r) => r.id),
      ),
    );
    for (const r of rows)
      await appendEvent(tx, ctx, {
        type: 'character.purged',
        roomId: r.campaignId,
        actor: SYSTEM,
        aggregate: { type: 'character', id: r.id },
        payload: { kind: r.kind },
      });
    return rows.length;
  });
}
