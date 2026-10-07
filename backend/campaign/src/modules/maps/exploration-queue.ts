/**
 * File des scènes à explorer (docs/exploration.md § 4) : une ligne par scène, écrite dans la
 * transaction de l'écriture qui change la vue des joueurs. Elle n'apparaît qu'au `COMMIT` (aucune
 * exploration d'un état annulé), survit à un redémarrage et se partage entre réplicas. Le
 * travailleur (`exploration-worker.ts`) la vide ; les travailleurs de ce processus sont réveillés
 * aussitôt (`kickExplorationWorkers`), sans attendre leur relecture périodique.
 *
 * Fichier à part de `exploration.ts` : `vision.ts` (qui met en file) ne dépend pas du calcul.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/outbox.js';

type Conn = Db | Tx;

/** Scènes déjà mises en file dans une transaction (une insertion par scène). */
const queuedIn = new WeakMap<object, Set<string>>();

/** Réveils des travailleurs de ce processus. */
const kickers = new Set<() => void>();

/** Un travailleur s'inscrit pour être réveillé ; renvoie le retrait. */
export function onExplorationQueued(kick: () => void): () => void {
  kickers.add(kick);
  return () => void kickers.delete(kick);
}

/** Réveille les travailleurs de ce processus (ils relisent la file un peu plus tard). */
export function kickExplorationWorkers() {
  for (const kick of kickers) kick();
}

/**
 * Met la scène en file si l'exploration y est active : une fois par transaction et par scène.
 */
export async function queueExploration(tx: Conn, map: { id: string; campaignId: string }) {
  const done = queuedIn.get(tx) ?? new Set<string>();
  queuedIn.set(tx, done);
  if (done.has(map.id)) return;
  done.add(map.id);
  await tx.execute(sql`
    INSERT INTO campaign.map_exploration_queue (map_id, campaign_id)
    SELECT m.id, m.campaign_id FROM campaign.maps m
     WHERE m.id = ${map.id} AND m.campaign_id = ${map.campaignId} AND m.exploration <> 'off'
    ON CONFLICT (map_id) DO NOTHING`);
  kickExplorationWorkers();
}

/**
 * Prend la plus ancienne scène de la file (supprimée : un seul réplica la traite, sans bloquer
 * les écritures qui la remettraient en file). Null : file vide.
 */
export async function claimQueuedExploration(
  db: Db,
  /** Seulement cette scène (tests). */
  only?: string,
): Promise<{ id: string; campaignId: string } | null> {
  const filter = only ? sql`WHERE map_id = ${only}` : sql``;
  const { rows } = await db.execute<{ map_id: string; campaign_id: string }>(sql`
    DELETE FROM campaign.map_exploration_queue q
     WHERE q.map_id = (
       SELECT map_id FROM campaign.map_exploration_queue
        ${filter}
        ORDER BY queued_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED)
    RETURNING q.map_id, q.campaign_id`);
  const row = rows[0];
  return row ? { id: row.map_id, campaignId: row.campaign_id } : null;
}

/** Remet une scène en file (calcul échoué) ; sans effet si la scène a disparu. */
export async function requeueExploration(db: Db, map: { id: string; campaignId: string }) {
  await db.execute(sql`
    INSERT INTO campaign.map_exploration_queue (map_id, campaign_id)
    SELECT m.id, m.campaign_id FROM campaign.maps m WHERE m.id = ${map.id}
    ON CONFLICT (map_id) DO NOTHING`);
}
