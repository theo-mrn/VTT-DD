/**
 * Journal d'actions d'une campagne (service history, docs/api-history.md), par
 * la gateway `/v1/history`. Remplace la lecture directe de la collection
 * Firestore `Historique/{roomId}/events` par l'ancienne app.
 *
 * - Chaque événement est l'enveloppe du bus, plus son rang `seq` dans la
 *   campagne et le personnage concerné (`characterId`, dérivé par le service).
 * - La visibilité est appliquée par le serveur : le MJ voit tout, un joueur
 *   les événements publics et ceux dont il est l'auteur.
 * - Les événements de l'ancienne app ont un type `legacy.<type>` (`legacy.combat`,
 *   `legacy.inventaire`…) et leur payload d'origine (`LegacyPayload`).
 *
 * Le `seq` d'history est propre à la campagne : ce n'est pas la séquence du
 * flux que realtime envoie comme curseur (`lib/realtime.ts`).
 */
import { api } from './api';

// ─── Types du contrat ────────────────────────────────────────────────────────

/**
 * `public` : tous les membres ; `owner` : l'auteur et le MJ ; `gm_only` : le MJ
 * seul (jamais renvoyé à un joueur).
 */
export type HistoryVisibility = 'public' | 'owner' | 'gm_only';

export interface HistoryEvent<P = Record<string, unknown>> {
  id: string;
  /** Rang dans la campagne (1, 2, 3…) ; null pour un événement sans campagne. */
  seq: number | null;
  type: string;
  version: number;
  /** Date de l'action. */
  occurredAt: string;
  /** Date d'enregistrement dans le journal. */
  recordedAt: string;
  /** Campagne (nom du champ dans l'enveloppe du bus). */
  roomId: string | null;
  actor: { userId: string | null; role: string; characterId: string | null };
  aggregate: { type: string; id: string };
  /** Personnage concerné : l'agrégat s'il s'agit d'un personnage, sinon celui incarné par l'auteur. */
  characterId: string | null;
  visibility: HistoryVisibility;
  payload: P;
  correlationId: string;
  causationId: string | null;
}

export interface HistoryPage {
  events: HistoryEvent[];
  hasMore: boolean;
}

/** Payload d'un événement importé de l'ancien Historique (`legacy.<type>`). */
export interface LegacyPayload {
  message?: string;
  character?: {
    legacyId?: string | null;
    name?: string | null;
    /** null quand l'avatar était intégré en base64 (retiré à l'import). */
    avatar?: string | null;
    type?: string | null;
  } | null;
  details?: Record<string, unknown> | null;
  extra?: Record<string, unknown>;
  legacy?: { source?: string; path?: string; type?: string };
}

export interface HistoryQuery {
  campaignId: string;
  /** Rang strictement supérieur (rattrapage) ; ordre par défaut alors : croissant. */
  afterSeq?: number;
  /** Rang strictement inférieur (page précédente). */
  beforeSeq?: number;
  /** Date de l'action, incluse (ISO 8601 avec fuseau). */
  from?: string;
  /** Date de l'action, exclue (ISO 8601 avec fuseau). */
  to?: string;
  characterId?: string;
  /** Types exacts ou par domaine (`legacy.*`) : 20 au plus. */
  types?: readonly string[];
  /** 50 par défaut, 200 au plus. */
  limit?: number;
  order?: 'asc' | 'desc';
}

export const HISTORY_MAX_LIMIT = 200;

// ─── Lecture ─────────────────────────────────────────────────────────────────

/** GET /v1/history : événements visibles par l'appelant. */
export function listHistory(query: HistoryQuery): Promise<HistoryPage> {
  const params = new URLSearchParams({ campaignId: query.campaignId });
  if (query.afterSeq !== undefined) params.set('afterSeq', String(query.afterSeq));
  if (query.beforeSeq !== undefined) params.set('beforeSeq', String(query.beforeSeq));
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.characterId) params.set('characterId', query.characterId);
  if (query.types?.length) params.set('types', query.types.join(','));
  if (query.limit) params.set('limit', String(Math.min(query.limit, HISTORY_MAX_LIMIT)));
  if (query.order) params.set('order', query.order);
  return api<HistoryPage>(`/v1/history?${params}`);
}

/** Plus grand rang d'une liste d'événements (null si aucun n'en porte). */
export function maxSeq(events: readonly Pick<HistoryEvent, 'seq'>[]): number | null {
  let max: number | null = null;
  for (const e of events) if (e.seq !== null && (max === null || e.seq > max)) max = e.seq;
  return max;
}

/** Plus petit rang d'une liste d'événements (null si aucun n'en porte). */
export function minSeq(events: readonly Pick<HistoryEvent, 'seq'>[]): number | null {
  let min: number | null = null;
  for (const e of events) if (e.seq !== null && (min === null || e.seq < min)) min = e.seq;
  return min;
}

/** Fusionne des événements par identifiant, du plus récent au plus ancien (rang décroissant). */
export function mergeHistory(list: readonly HistoryEvent[], incoming: readonly HistoryEvent[]) {
  if (!incoming.length) return list as HistoryEvent[];
  const byId = new Map(list.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort(
    (a, b) =>
      (b.seq ?? 0) - (a.seq ?? 0) ||
      (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0),
  );
}
