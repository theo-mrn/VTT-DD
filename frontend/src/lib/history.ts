/**
 * Journal d'actions d'une campagne (service history, docs/api-history.md), par
 * la gateway `/v1/history`. Remplace la lecture directe de la collection
 * Firestore `Historique/{roomId}/events` par l'ancienne app.
 *
 * - Chaque événement est l'enveloppe du bus, plus son rang `seq` dans la
 *   campagne et le personnage concerné (`characterId`, dérivé par le service).
 * - La visibilité est appliquée par le serveur : le MJ voit tout, un joueur
 *   les événements publics et ceux dont il est l'auteur.
 * - Les événements de l'ancienne app ont un type `legacy.<type>` et leur
 *   payload d'origine (`LegacyPayload`).
 *
 * Temps réel : un événement reçu de realtime ne sert que de signal. Le journal
 * est relu par `afterSeq` (rang d'history, propre à la campagne ; jamais la
 * séquence du flux realtime), ce qui applique la visibilité d'history. history
 * enregistre l'événement en parallèle de realtime : s'il n'est pas encore là,
 * la relecture est retentée un peu plus tard.
 */
'use client';

import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { compareCodeUnits } from '@vtt/contracts';
import { useCallback, useEffect, useRef } from 'react';
import { api } from './api';
import { useCampaignEvents, type RealtimeEvent } from './realtime';

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

/**
 * Types montrés par la chronique (paramètre `types`, 20 au plus). Les
 * événements techniques (brouillard, réglages, couches de la carte, chaque
 * pas d'un jeton, préférences, discussion) n'y figurent pas : l'ancien
 * Historique ne les enregistrait pas.
 */
export const JOURNAL_TYPES = [
  'legacy.*',
  'character.created',
  'character.updated',
  'character.deleted',
  'character.action_resolved',
  'dice.rolled',
  'combat.*',
  'campaign.member_joined',
  'campaign.member_left',
  'campaign.character_added',
  'campaign.character_removed',
  'campaign.character_played',
  'token.created',
  'token.deleted',
  'map_settings.updated',
] as const;

/** Types suivis en temps réel (les `legacy.*` n'arrivent jamais par le bus). */
export const LIVE_TYPES = JOURNAL_TYPES.filter((t) => !t.startsWith('legacy.'));

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
    (a, b) => (b.seq ?? 0) - (a.seq ?? 0) || compareCodeUnits(b.occurredAt, a.occurredAt),
  );
}

// ─── Cache ───────────────────────────────────────────────────────────────────

/** Taille d'une page de la chronique. */
const PAGE = 100;
/** Relecture groupée après une rafale d'événements. */
const DEBOUNCE_MS = 250;
/** Événement pas encore enregistré par history : nouvelles tentatives (0,5 s, 1 s, 2 s, 4 s). */
const RETRY_BASE_MS = 500;
const RETRIES = 4;
/** Relecture de secours quand le temps réel est coupé (onglet visible). */
const FALLBACK_POLL_MS = 30_000;

export const clesHistorique = {
  racine: ['historique'] as const,
  campagne: (campaignId: string) => ['historique', campaignId] as const,
  /** Chronique d'une campagne, ou d'un de ses personnages. */
  flux: (campaignId: string, characterId: string | null) =>
    ['historique', campaignId, characterId ?? 'tous'] as const,
};

type DonneesFlux = InfiniteData<HistoryPage, number | null>;

/** Chronique d'une campagne (ou d'un personnage), du plus récent au plus ancien, par pages. */
export function useHistorique(campaignId: string, characterId: string | null = null) {
  return useInfiniteQuery({
    queryKey: clesHistorique.flux(campaignId, characterId),
    queryFn: ({ pageParam }) =>
      listHistory({
        campaignId,
        characterId: characterId ?? undefined,
        types: JOURNAL_TYPES,
        limit: PAGE,
        beforeSeq: pageParam ?? undefined,
      }),
    initialPageParam: null as number | null,
    getNextPageParam: (derniere) =>
      derniere.hasMore ? (minSeq(derniere.events) ?? undefined) : undefined,
  });
}

/**
 * Relit les événements postérieurs au plus récent connu de chaque chronique
 * en cache pour cette campagne, et les ajoute en tête. Renvoie les
 * identifiants trouvés.
 */
async function rattraper(client: QueryClient, campaignId: string): Promise<Set<string>> {
  const trouves = new Set<string>();
  const requetes = client.getQueriesData<DonneesFlux>({
    queryKey: clesHistorique.campagne(campaignId),
  });
  for (const [cle, donnees] of requetes) {
    if (!donnees?.pages.length) continue;
    const characterId = cle[2] === 'tous' ? undefined : (cle[2] as string);
    const depuis = maxSeq(donnees.pages.flatMap((p) => p.events)) ?? 0;
    const nouveaux = await evenementsApres(campaignId, characterId, depuis);
    for (const e of nouveaux) trouves.add(e.id);
    if (nouveaux.length) ajouterEnTete(client, cle, nouveaux);
  }
  return trouves;
}

/** Tous les événements du journal postérieurs à `depuis`, page après page. */
async function evenementsApres(
  campaignId: string,
  characterId: string | undefined,
  depuis: number,
): Promise<HistoryEvent[]> {
  let curseur = depuis;
  const nouveaux: HistoryEvent[] = [];
  for (;;) {
    const page = await listHistory({
      campaignId,
      characterId,
      afterSeq: curseur,
      types: JOURNAL_TYPES,
      limit: HISTORY_MAX_LIMIT,
      order: 'asc',
    });
    nouveaux.push(...page.events);
    curseur = Math.max(curseur, maxSeq(page.events) ?? 0);
    if (!page.hasMore || !page.events.length) return nouveaux;
  }
}

/** Ajoute des événements en tête de la première page d'une chronique en cache. */
function ajouterEnTete(client: QueryClient, cle: QueryKey, nouveaux: HistoryEvent[]) {
  client.setQueryData<DonneesFlux>(cle, (d) =>
    d && d.pages.length
      ? {
          ...d,
          pages: [
            { ...d.pages[0]!, events: mergeHistory(d.pages[0]!.events, nouveaux) },
            ...d.pages.slice(1),
          ],
        }
      : d,
  );
}

/**
 * Tient à jour en direct les chroniques affichées d'une campagne : chaque
 * événement annoncé par realtime déclenche une relecture par `afterSeq`. À
 * chaque (ré)abonnement, et toutes les 30 s quand le temps réel est coupé,
 * le journal est aussi relu.
 */
export function useHistoriqueEnDirect(campaignId: string): { live: boolean } {
  const client = useQueryClient();
  const attendus = useRef(new Set<string>());
  const essais = useRef(0);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enCours = useRef(false);
  const relancer = useRef(false);

  const planifier = useCallback(
    (delai: number) => {
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => {
        minuteur.current = null;
        void executer();
      }, delai);

      async function executer() {
        if (enCours.current) {
          relancer.current = true;
          return;
        }
        enCours.current = true;
        try {
          const trouves = await rattraper(client, campaignId);
          for (const id of trouves) attendus.current.delete(id);
        } catch {
          // Service injoignable : nouvelle tentative au prochain signal
        } finally {
          enCours.current = false;
          if (relancer.current) {
            relancer.current = false;
            planifier(DEBOUNCE_MS);
          } else if (attendus.current.size && essais.current < RETRIES) {
            essais.current += 1;
            planifier(RETRY_BASE_MS * 2 ** (essais.current - 1));
          } else {
            // Toujours absent : pas visible pour ce lecteur (ou pas encore relayé)
            attendus.current.clear();
            essais.current = 0;
          }
        }
      }
    },
    [client, campaignId],
  );

  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = null;
    },
    [campaignId],
  );

  const surEvenement = useCallback(
    (e: RealtimeEvent) => {
      // Version expurgée (réservée au MJ) : history ne la montre pas non plus
      if (e.redacted) return;
      attendus.current.add(e.event.id);
      essais.current = 0;
      planifier(DEBOUNCE_MS);
    },
    [planifier],
  );
  const { live, generation } = useCampaignEvents(campaignId, LIVE_TYPES, surEvenement);

  // (Ré)abonnement : ce qui a pu arriver pendant la coupure est relu
  useEffect(() => {
    if (live && generation) planifier(0);
  }, [live, generation, planifier]);

  // Secours : relecture lente tant que le temps réel est coupé
  useEffect(() => {
    if (live) return;
    const releve = window.setInterval(() => {
      if (document.visibilityState === 'visible') planifier(0);
    }, FALLBACK_POLL_MS);
    return () => window.clearInterval(releve);
  }, [live, planifier]);

  return { live };
}
