/**
 * Purge définitive (docs/nettoyage.md) : personnages et modèles restés plus de `TRASH_DAYS` jours
 * dans la corbeille, instances de PNJ supprimées dès la passe suivante (leur modèle demeure).
 * La ligne part (les tables liées suivent par ON DELETE CASCADE) avec son `*.purged` dans
 * l'outbox ; puis, après la transaction, le dossier `characters/<id>/` du stockage. Un dossier non
 * supprimé (stockage injoignable) sera repris par la passe des fichiers orphelins. Les images des
 * modèles aussi : elles peuvent être partagées par des PNJ déjà posés.
 */
import { removePrefix, type ObjectStore } from '@vtt/platform';
import { TRASH_DAYS } from '@vtt/contracts';
import { and, eq, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client.js';
import { appendEvent, type EventContext } from '../db/outbox.js';
import { characters, npcTemplates, objectTemplates } from '../db/schema.js';

export const PURGE_BATCH = 50;

const SYSTEM = { userId: null, role: 'system', characterId: null } as const;

/** Supprimé depuis plus de TRASH_DAYS jours. */
const expired = (column: PgColumn) =>
  and(isNotNull(column), sql`${column} <= now() - make_interval(days => ${TRASH_DAYS})`) as SQL;

export interface PurgeReport {
  characters: number;
  npcTemplates: number;
  objectTemplates: number;
  files: number;
}

interface Options {
  db: Db;
  store: ObjectStore | undefined;
  ctx: EventContext;
  /** Journalise ce qui serait purgé, sans rien supprimer. */
  dryRun?: boolean;
  log?: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
}

/** Une passe complète, par lots, jusqu'à ce qu'il ne reste rien à purger. */
export async function purge(o: Options): Promise<PurgeReport> {
  const report: PurgeReport = { characters: 0, npcTemplates: 0, objectTemplates: 0, files: 0 };
  if (o.dryRun) {
    const due = await dueCounts(o.db);
    o.log?.info(due, 'purge (essai) : rien supprimé');
    return { ...due, files: 0 };
  }
  for (;;) {
    const ids = await purgeCharacters(o.db, o.ctx);
    report.characters += ids.length;
    for (const id of ids) {
      if (!o.store) break;
      try {
        report.files += await removePrefix(o.store, `characters/${id}/`);
      } catch (err) {
        o.log?.warn({ err, characterId: id }, 'dossier du personnage non supprimé');
      }
    }
    if (ids.length < PURGE_BATCH) break;
  }
  for (;;) {
    const n = await purgeTemplates(o.db, o.ctx, 'npc');
    report.npcTemplates += n;
    if (n < PURGE_BATCH) break;
  }
  for (;;) {
    const n = await purgeTemplates(o.db, o.ctx, 'object');
    report.objectTemplates += n;
    if (n < PURGE_BATCH) break;
  }
  if (report.characters + report.npcTemplates + report.objectTemplates)
    o.log?.info({ ...report }, 'purge définitive');
  return report;
}

const dueCharacters = or(
  and(isNotNull(characters.deletedAt), eq(characters.kind, 'npc')),
  expired(characters.deletedAt),
);

async function dueCounts(db: Db) {
  const count = sql<number>`count(*)::int`;
  const [[c], [n], [t]] = await Promise.all([
    db.select({ count }).from(characters).where(dueCharacters),
    db.select({ count }).from(npcTemplates).where(expired(npcTemplates.deletedAt)),
    db.select({ count }).from(objectTemplates).where(expired(objectTemplates.deletedAt)),
  ]);
  return { characters: c!.count, npcTemplates: n!.count, objectTemplates: t!.count };
}

/** Un lot de personnages ; SKIP LOCKED : une écriture en cours n'est pas attendue. */
function purgeCharacters(db: Db, ctx: EventContext): Promise<string[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: characters.id, campaignId: characters.campaignId, kind: characters.kind })
      .from(characters)
      .where(dueCharacters)
      .limit(PURGE_BATCH)
      .for('update', { skipLocked: true });
    if (!rows.length) return [];
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
    return rows.map((r) => r.id);
  });
}

function purgeTemplates(db: Db, ctx: EventContext, kind: 'npc' | 'object'): Promise<number> {
  const table = kind === 'npc' ? npcTemplates : objectTemplates;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: table.id, campaignId: table.campaignId })
      .from(table)
      .where(expired(table.deletedAt))
      .limit(PURGE_BATCH)
      .for('update', { skipLocked: true });
    if (!rows.length) return 0;
    await tx.delete(table).where(
      inArray(
        table.id,
        rows.map((r) => r.id),
      ),
    );
    for (const r of rows)
      await appendEvent(tx, ctx, {
        type: `${kind}_template.purged`,
        roomId: r.campaignId,
        actor: SYSTEM,
        aggregate: { type: `${kind}_template`, id: r.id },
        payload: {},
        visibility: 'gm_only',
      });
    return rows.length;
  });
}
