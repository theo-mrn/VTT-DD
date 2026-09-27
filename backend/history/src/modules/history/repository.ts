/**
 * Lecture du journal : timeline d'une campagne filtrée selon qui la lit, et
 * vérification de la chaîne de hash (fonction SQL history.verify_chain, la
 * même que celle du test de restauration des sauvegardes).
 */
import { and, asc, desc, eq, gt, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import type { CampaignRole } from '../../clients/campaign.js';
import type { Db } from '../../db/client.js';
import { events } from '../../db/schema.js';
import type { ApiRow } from '../schemas.js';

/** Qui lit : le MJ voit tout ; les autres, le public et ce dont ils sont l'auteur (`owner`). */
export interface Viewer {
  userId: string;
  role: CampaignRole;
}

/**
 * Visibilité (reprise de l'ancienne app : un événement avec `targetUserId`
 * n'était montré qu'à cet utilisateur) :
 *  - `public`  : tous les membres ;
 *  - `owner`   : son auteur (actor.userId) et le MJ ;
 *  - `gm_only` : le MJ seul (jets secrets, PNJ cachés).
 */
export function visibleTo(viewer: Viewer): SQL | undefined {
  if (viewer.role === 'gm') return undefined;
  return or(
    eq(events.visibility, 'public'),
    and(eq(events.visibility, 'owner'), eq(events.actorId, viewer.userId)),
  );
}

export interface EventFilter {
  campaignId: string;
  /** Événements de rang strictement supérieur (rattrapage après reconnexion). */
  afterSeq?: number;
  /** Événements de rang strictement inférieur (page précédente). */
  beforeSeq?: number;
  /** Bornes de date sur occurredAt (inclusive, exclusive). */
  from?: Date;
  to?: Date;
  characterId?: string;
  /** Types exacts ou `domaine.*`. */
  types?: string[];
  limit: number;
  order: 'asc' | 'desc';
  /** Absent : aucun filtre de visibilité (route interne sans lecteur). */
  viewer?: Viewer;
}

const apiColumns = {
  id: events.id,
  occurredAt: events.occurredAt,
  recordedAt: events.recordedAt,
  campaignId: events.campaignId,
  seq: events.seq,
  type: events.type,
  version: events.version,
  actorId: events.actorId,
  actorRole: events.actorRole,
  actorCharacterId: events.actorCharacterId,
  aggregateType: events.aggregateType,
  aggregateId: events.aggregateId,
  characterId: events.characterId,
  visibility: events.visibility,
  payload: events.payload,
  correlationId: events.correlationId,
  causationId: events.causationId,
};

export async function listEvents(
  db: Db,
  f: EventFilter,
): Promise<{ rows: ApiRow[]; hasMore: boolean }> {
  const conditions: (SQL | undefined)[] = [eq(events.campaignId, f.campaignId)];
  if (f.afterSeq !== undefined) conditions.push(gt(events.seq, f.afterSeq));
  if (f.beforeSeq !== undefined) conditions.push(lt(events.seq, f.beforeSeq));
  if (f.from) conditions.push(gte(events.occurredAt, f.from));
  if (f.to) conditions.push(lt(events.occurredAt, f.to));
  if (f.characterId) conditions.push(eq(events.characterId, f.characterId));
  if (f.types?.length) {
    const exact = f.types.filter((t) => !t.endsWith('.*'));
    const prefixes = f.types.filter((t) => t.endsWith('.*')).map((t) => t.slice(0, -1));
    conditions.push(
      or(
        ...(exact.length ? [inArray(events.type, exact)] : []),
        ...prefixes.map((p) => sql`starts_with(${events.type}, ${p})`),
      ),
    );
  }
  if (f.viewer) conditions.push(visibleTo(f.viewer));

  const rows = await db
    .select(apiColumns)
    .from(events)
    .where(and(...conditions))
    .orderBy(f.order === 'asc' ? asc(events.seq) : desc(events.seq))
    .limit(f.limit + 1);
  return { rows: rows.slice(0, f.limit) as ApiRow[], hasMore: rows.length > f.limit };
}

/** Dernier rang attribué dans la campagne (0 si elle n'a encore aucun événement). */
export async function lastSeq(db: Db, campaignId: string): Promise<number> {
  const r = await db.execute<{ last_seq: string | number }>(
    sql`select last_seq from history.campaign_heads where campaign_id = ${campaignId}`,
  );
  return Number(r.rows[0]?.last_seq ?? 0);
}

export interface ChainReport {
  ok: boolean;
  events: number;
  lastSeq: number;
  /** Premier maillon cassé : rang, événement (null pour la tête) et raison. */
  firstBroken: { seq: number; id: string | null; reason: string } | null;
}

/**
 * Recalcule toute la chaîne d'une campagne. Coûteux sur un long historique :
 * délai porté à 60 s pour cette seule transaction.
 */
export async function verifyChain(db: Db, campaignId: string): Promise<ChainReport> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '60s'`);
    const broken = await tx.execute<{ seq: string | number; id: string | null; reason: string }>(
      sql`select seq, id, reason from history.verify_chain(${campaignId}::uuid) limit 1`,
    );
    const stats = await tx.execute<{ n: string | number; last: string | number | null }>(
      sql`select count(*) as n, max(seq) as last from history.events where campaign_id = ${campaignId}`,
    );
    const b = broken.rows[0];
    return {
      ok: !b,
      events: Number(stats.rows[0]?.n ?? 0),
      lastSeq: Number(stats.rows[0]?.last ?? 0),
      firstBroken: b ? { seq: Number(b.seq), id: b.id, reason: b.reason } : null,
    };
  });
}
