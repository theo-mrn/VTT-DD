/**
 * Ajout au journal : un événement du bus (ou de l'ancien Historique importé)
 * devient une ligne de history.events, dans une transaction :
 *
 *   1. dédoublonnage par id d'événement (inbox) : un événement relivré par
 *      JetStream (livraison au moins une fois) ou réimporté est ignoré ;
 *   2. tête de chaîne de la campagne créée si besoin puis verrouillée (upsert
 *      qui prend le verrou de ligne) : les ajouts d'une même campagne passent
 *      un par un, ceux des autres campagnes restent parallèles ;
 *   3. seq = last_seq + 1, prev_hash = last_hash ; Postgres calcule
 *      hash = sha256(prev_hash || JSON canonique) (trigger events_hash) ;
 *   4. tête mise à jour avec ce seq et ce hash.
 *
 * Les événements sans campagne (roomId null : compte, profil…) sont stockés
 * sans seq ni prev_hash : leur hash ne couvre qu'eux-mêmes (pas de chaîne
 * « globale », qui ferait passer tous ces événements par un seul verrou).
 */
import type { EventEnvelope } from '@vtt/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { campaignHeads, events, inbox, type NewEventRow } from '../db/schema.js';

/** Transaction Drizzle (même API que la base). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Qui ajoute : le consommateur du bus, ou l'import de l'ancien Historique. */
export type Consumer = 'history' | 'import';

export interface AppendResult {
  id: string;
  status: 'appended' | 'duplicate';
  /** Rang dans la campagne ; null pour un doublon ou un événement global. */
  seq: number | null;
}

/** Colonnes d'un événement (enveloppe du bus), hors seq et hash. */
export function toRow(e: EventEnvelope): Omit<NewEventRow, 'seq' | 'prevHash' | 'hash'> {
  return {
    id: e.id.toLowerCase(),
    occurredAt: new Date(e.occurredAt),
    campaignId: e.roomId?.toLowerCase() ?? null,
    type: e.type,
    version: e.version,
    actorId: e.actor.userId?.toLowerCase() ?? null,
    actorRole: e.actor.role,
    actorCharacterId: e.actor.characterId?.toLowerCase() ?? null,
    aggregateType: e.aggregate.type,
    aggregateId: e.aggregate.id,
    visibility: e.visibility,
    payload: e.payload,
    correlationId: e.correlationId,
    causationId: e.causationId,
    traceparent: e.traceparent,
  };
}

/**
 * Ajoute des événements d'une même campagne (ou tous globaux), dans l'ordre
 * donné, en une transaction. Renvoie le sort de chaque événement.
 */
export async function appendEvents(
  db: Db,
  batch: EventEnvelope[],
  consumer: Consumer,
): Promise<AppendResult[]> {
  if (!batch.length) return [];
  const rows = batch.map(toRow);
  const campaignId = rows[0]!.campaignId ?? null;
  if (rows.some((r) => (r.campaignId ?? null) !== campaignId)) {
    throw new Error('appendEvents : un lot ne concerne qu’une campagne');
  }

  return db.transaction(async (tx) => {
    // 1. Dédoublonnage : seuls les événements jamais vus sont gardés
    const fresh = await tx
      .insert(inbox)
      .values([...new Set(rows.map((r) => r.id))].map((eventId) => ({ eventId, consumer })))
      .onConflictDoNothing()
      .returning({ eventId: inbox.eventId });
    const kept = new Set(fresh.map((f) => f.eventId));
    const results = new Map<string, AppendResult>();
    for (const r of rows) results.set(r.id, { id: r.id, status: 'duplicate', seq: null });
    const toAppend = rows.filter((r) => kept.delete(r.id));
    if (!toAppend.length) return rows.map((r) => results.get(r.id)!);

    if (!campaignId) {
      await tx.insert(events).values(toAppend.map((r) => ({ ...r, seq: null, prevHash: null })));
      for (const r of toAppend) results.set(r.id, { id: r.id, status: 'appended', seq: null });
      return rows.map((r) => results.get(r.id)!);
    }

    // 2. Tête de chaîne créée si besoin et verrouillée jusqu'à la fin de la transaction
    const [head] = await tx
      .insert(campaignHeads)
      .values({ campaignId, lastSeq: 0, lastHash: null })
      .onConflictDoUpdate({
        target: campaignHeads.campaignId,
        set: { campaignId: sql`excluded.campaign_id` },
      })
      .returning({ lastSeq: campaignHeads.lastSeq, lastHash: campaignHeads.lastHash });
    let seq = head!.lastSeq;
    let hash = head!.lastHash;

    // 3. Un seq et un maillon par événement, hash calculé par Postgres
    for (const r of toAppend) {
      seq += 1;
      const [inserted] = await tx
        .insert(events)
        .values({ ...r, seq, prevHash: hash })
        .returning({ hash: events.hash });
      hash = inserted!.hash;
      results.set(r.id, { id: r.id, status: 'appended', seq });
    }

    // 4. Nouvelle tête
    await tx
      .update(campaignHeads)
      .set({ lastSeq: seq, lastHash: hash, updatedAt: sql`now()` })
      .where(eq(campaignHeads.campaignId, campaignId));
    return rows.map((r) => results.get(r.id)!);
  });
}

/**
 * Erreur définitive de Postgres (donnée invalide, contrainte violée) : la
 * relivrer ne changerait rien. Les autres (connexion, délai) sont passagères.
 */
export function isPermanentDbError(err: unknown): boolean {
  const code = dbErrorCode(err);
  return !!code && /^(22|23)[0-9A-Z]{3}$/.test(code);
}

/** Code SQLSTATE de l'erreur Postgres, même enveloppée (DrizzleQueryError.cause). */
export function dbErrorCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let depth = 0; e && depth < 5; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}
