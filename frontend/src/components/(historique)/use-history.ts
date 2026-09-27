'use client';

/**
 * Données du panneau Historique : noms (campagne, personnages, système, cartes),
 * listes paginées du journal (une journée, un personnage) et suivi en direct.
 *
 * Temps réel : un événement reçu de realtime ne sert que de signal. Le journal
 * est relu par `afterSeq` (rang d'history, propre à la campagne ; jamais la
 * séquence du flux realtime), ce qui applique la visibilité d'history et donne
 * le personnage concerné. history enregistre l'événement en parallèle de
 * realtime : s'il n'est pas encore là, la relecture est retentée un peu plus
 * tard. À chaque (ré)abonnement, et toutes les 30 s quand le temps réel est
 * coupé, le journal est aussi relu par `afterSeq`.
 */
import type { SystemeCharge } from '@vtt/rules';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import {
  getCampaign,
  listCampaignCharacters,
  type CampaignCharacter,
  type CampaignMember,
} from '@/lib/campaigns';
import {
  HISTORY_MAX_LIMIT,
  listHistory,
  maxSeq,
  mergeHistory,
  minSeq,
  type HistoryEvent,
} from '@/lib/history';
import { useCampaignEvents, type RealtimeEvent } from '@/lib/realtime';
import { loadSystem } from '@/lib/systems';
import {
  JOURNAL_TYPES,
  LIVE_TYPES,
  namesFromEvents,
  type CharacterLabel,
  type FormatContext,
  type UserLabel,
} from './format';

/** Relecture groupée après une rafale d'événements. */
const DEBOUNCE_MS = 250;
/** Événement pas encore enregistré par history : nouvelles tentatives (0,5 s, 1 s, 2 s, 4 s). */
const RETRY_BASE_MS = 500;
const RETRIES = 4;
/** Relecture de secours quand le temps réel est coupé (onglet visible). */
const FALLBACK_POLL_MS = 30_000;
/** Événements récents lus au départ : dates proposées, comme l'ancienne app (200). */
const RECENT_LIMIT = 200;

// ─── Noms ────────────────────────────────────────────────────────────────────

const PARTY_TRAVEL = 'map_settings.updated';
const ROSTER_EVENTS = new Set([
  'campaign.character_added',
  'campaign.character_removed',
  'character.updated',
  'character.deleted',
]);

export interface HistoryLabels {
  ctx: FormatContext;
  /** Personnages de la campagne (vue « Par personnage »). */
  characters: CampaignCharacter[];
  loadingCharacters: boolean;
  /** Relit les personnages (engagé, retiré, renommé en direct). */
  refreshCharacters(): void;
}

/**
 * Noms et libellés, chargés en lot une fois : membres et rôle (campagne),
 * personnages engagés, système de jeu (mis en cache par `loadSystem`), et
 * les cartes seulement si un voyage du groupe est affiché.
 */
export function useHistoryLabels(
  campaignId: string,
  events: readonly HistoryEvent[],
): HistoryLabels {
  const [characters, setCharacters] = useState<CampaignCharacter[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(true);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [isGm, setIsGm] = useState(false);
  const [system, setSystem] = useState<SystemeCharge | null>(null);
  const [maps, setMaps] = useState<ReadonlyMap<string, string>>(new Map());
  const mapsRequested = useRef<string | null>(null);
  const charactersRequest = useRef(0);

  const refreshCharacters = useCallback(() => {
    const request = ++charactersRequest.current;
    listCampaignCharacters(campaignId)
      .then((list) => request === charactersRequest.current && setCharacters(list))
      .catch(() => undefined)
      .finally(() => request === charactersRequest.current && setLoadingCharacters(false));
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;
    setCharacters([]);
    setMembers([]);
    setSystem(null);
    setIsGm(false);
    setLoadingCharacters(true);
    refreshCharacters();
    getCampaign(campaignId)
      .then((c) => {
        if (cancelled) return;
        setMembers(c.members);
        setIsGm(c.role === 'gm');
        return loadSystem(c.system.id).then((r) => !cancelled && setSystem(r.system));
      })
      // Sans campagne ni système, les lignes restent lisibles (noms et clés bruts)
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [campaignId, refreshCharacters]);

  const needsMaps = useMemo(() => events.some((e) => e.type === PARTY_TRAVEL), [events]);
  useEffect(() => {
    if (!needsMaps || mapsRequested.current === campaignId) return;
    mapsRequested.current = campaignId;
    api<{ items: { id: string; name: string }[] }>(
      `/v1/campaigns/${encodeURIComponent(campaignId)}/maps`,
    )
      .then((r) => setMaps(new Map(r.items.map((m) => [m.id.toLowerCase(), m.name]))))
      .catch(() => undefined);
  }, [needsMaps, campaignId]);

  const extraNames = useMemo(() => namesFromEvents(events), [events]);

  const ctx = useMemo<FormatContext>(() => {
    const chars = new Map<string, CharacterLabel>();
    for (const [id, name] of extraNames)
      chars.set(id, { name, avatarUrl: null, side: null, type: null });
    for (const c of characters)
      chars.set(c.characterId.toLowerCase(), {
        name: c.name,
        avatarUrl: c.avatarUrl,
        side: c.side,
        type: c.type || null,
      });
    const users = new Map<string, UserLabel>(
      members.map((m) => [m.userId.toLowerCase(), { name: m.name, avatarUrl: m.avatarUrl }]),
    );
    return { characters: chars, users, maps, system, viewerIsGm: isGm };
  }, [extraNames, characters, members, maps, system, isGm]);

  return { ctx, characters, loadingCharacters, refreshCharacters };
}

/** Un événement change-t-il la liste des personnages (engagement, nom, suppression) ? */
export function touchesRoster(events: readonly HistoryEvent[]): boolean {
  return events.some(
    (e) =>
      ROSTER_EVENTS.has(e.type) &&
      (e.type !== 'character.updated' || e.payload.operation === 'profil'),
  );
}

// ─── Listes paginées ─────────────────────────────────────────────────────────

export interface HistoryFilter {
  /** Date de l'action, incluse (ISO avec fuseau). */
  from?: string;
  /** Date de l'action, exclue. */
  to?: string;
  characterId?: string;
}

const NO_EVENTS: HistoryEvent[] = [];

function matches(f: HistoryFilter, e: HistoryEvent): boolean {
  const at = Date.parse(e.occurredAt);
  if (f.from && at < Date.parse(f.from)) return false;
  if (f.to && at >= Date.parse(f.to)) return false;
  if (f.characterId && e.characterId?.toLowerCase() !== f.characterId.toLowerCase()) return false;
  return true;
}

export interface HistoryFeed {
  /** Du plus récent au plus ancien. */
  events: HistoryEvent[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  /** Page précédente (`beforeSeq`). */
  loadMore(): void;
  /** Ajoute les événements arrivés en direct qui correspondent au filtre. */
  push(events: readonly HistoryEvent[]): void;
}

/** Événements du journal pour un filtre (null : rien n'est chargé), page par page. */
export function useHistoryFeed(
  campaignId: string,
  filter: HistoryFilter | null,
  pageSize: number,
): HistoryFeed {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  /** Filtre des événements gardés, et filtre dont la première page est lue. */
  const [eventsKey, setEventsKey] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const key = filter ? [campaignId, filter.from, filter.to, filter.characterId].join('|') : null;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingMoreRef = useRef(false);
  const generation = useRef(0);
  const limit = Math.min(pageSize, HISTORY_MAX_LIMIT);

  useEffect(() => {
    const gen = ++generation.current;
    const f = filterRef.current;
    setEvents([]);
    setEventsKey(key);
    setLoadedKey(null);
    setHasMore(false);
    setError(null);
    loadingMoreRef.current = false;
    setLoadingMore(false);
    if (!key || !f) return;
    listHistory({ campaignId, ...f, types: JOURNAL_TYPES, limit })
      .then((page) => {
        if (gen !== generation.current) return;
        // Des événements arrivés en direct pendant le chargement sont gardés
        setEvents((list) => mergeHistory(list, page.events));
        setHasMore(page.hasMore);
      })
      .catch((e) => gen === generation.current && setError(errorMessage(e)))
      .finally(() => gen === generation.current && setLoadedKey(key));
  }, [key, campaignId, limit]);

  const loadMore = useCallback(() => {
    const f = filterRef.current;
    const before = minSeq(eventsRef.current);
    if (!f || before === null || loadingMoreRef.current || !hasMoreRef.current) return;
    const gen = generation.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    listHistory({ campaignId, ...f, types: JOURNAL_TYPES, limit, beforeSeq: before })
      .then((page) => {
        if (gen !== generation.current) return;
        setEvents((list) => mergeHistory(list, page.events));
        setHasMore(page.hasMore);
      })
      .catch((e) => gen === generation.current && setError(errorMessage(e)))
      .finally(() => {
        if (gen !== generation.current) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [campaignId, limit]);

  const push = useCallback((incoming: readonly HistoryEvent[]) => {
    const f = filterRef.current;
    if (!f) return;
    const matching = incoming.filter((e) => matches(f, e));
    if (matching.length) setEvents((list) => mergeHistory(list, matching));
  }, []);

  // Rendu suivant un changement de filtre, avant la remise à zéro : rien de l'ancien filtre
  const current = eventsKey === key;
  const loaded = current && loadedKey === key;
  return {
    events: current ? events : NO_EVENTS,
    loading: key !== null && !loaded,
    error: loaded ? error : null,
    hasMore: loaded && hasMore,
    loadingMore,
    loadMore,
    push,
  };
}

// ─── Suivi en direct ─────────────────────────────────────────────────────────

/**
 * Derniers événements de la campagne (null tant qu'ils ne sont pas lus), puis
 * chaque événement enregistré ensuite, passé à `onNew` dans l'ordre des rangs.
 */
export function useHistoryLive(
  campaignId: string,
  onNew: (events: HistoryEvent[]) => void,
): { recent: HistoryEvent[] | null } {
  const [recent, setRecent] = useState<HistoryEvent[] | null>(null);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  /** Dernier rang lu ; null tant que les événements récents ne sont pas chargés. */
  const cursor = useRef<number | null>(null);
  /** Événements signalés par realtime et pas encore relus dans history. */
  const awaiting = useRef(new Set<string>());
  const attempts = useRef(0);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const catchUpRef = useRef<() => Promise<void>>(async () => undefined);

  const schedule = useCallback((delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void catchUpRef.current();
    }, delay);
  }, []);

  const catchUp = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    const gen = generation.current;
    try {
      if (cursor.current === null) {
        const page = await listHistory({ campaignId, types: JOURNAL_TYPES, limit: RECENT_LIMIT });
        if (gen !== generation.current) return;
        cursor.current = maxSeq(page.events) ?? 0;
        for (const e of page.events) awaiting.current.delete(e.id);
        setRecent(page.events);
        return;
      }
      const found: HistoryEvent[] = [];
      for (;;) {
        const page = await listHistory({
          campaignId,
          afterSeq: cursor.current,
          types: JOURNAL_TYPES,
          limit: HISTORY_MAX_LIMIT,
          order: 'asc',
        });
        if (gen !== generation.current) return;
        cursor.current = Math.max(cursor.current, maxSeq(page.events) ?? 0);
        found.push(...page.events);
        if (!page.hasMore || !page.events.length) break;
      }
      for (const e of found) awaiting.current.delete(e.id);
      if (found.length) onNewRef.current(found);
    } catch {
      // Service injoignable : premier chargement vide, nouvelle tentative au prochain signal
      if (gen === generation.current && cursor.current === null) setRecent((r) => r ?? []);
    } finally {
      if (gen === generation.current) {
        inFlight.current = false;
        if (queued.current) {
          queued.current = false;
          schedule(DEBOUNCE_MS);
        } else if (awaiting.current.size && attempts.current < RETRIES) {
          attempts.current += 1;
          schedule(RETRY_BASE_MS * 2 ** (attempts.current - 1));
        } else {
          // Toujours absent : pas visible dans le journal pour ce lecteur (ou pas encore relayé)
          awaiting.current.clear();
          attempts.current = 0;
        }
      }
    }
  }, [campaignId, schedule]);
  catchUpRef.current = catchUp;

  // Premier chargement, et remise à zéro quand la campagne change
  useEffect(() => {
    generation.current += 1;
    cursor.current = null;
    awaiting.current.clear();
    attempts.current = 0;
    inFlight.current = false;
    queued.current = false;
    setRecent(null);
    void catchUpRef.current();
    return () => {
      generation.current += 1;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [campaignId]);

  const onEvent = useCallback(
    (e: RealtimeEvent) => {
      // Version expurgée (réservée au MJ) : history ne la montre pas non plus
      if (e.redacted) return;
      awaiting.current.add(e.event.id);
      attempts.current = 0;
      schedule(DEBOUNCE_MS);
    },
    [schedule],
  );
  const realtime = useCampaignEvents(campaignId, LIVE_TYPES, onEvent);

  // (Ré)abonnement : ce qui a pu arriver pendant la coupure est relu par afterSeq
  useEffect(() => {
    if (!realtime.live || !realtime.generation) return;
    void catchUpRef.current();
  }, [realtime.live, realtime.generation]);

  // Secours : relecture lente tant que le temps réel est coupé
  useEffect(() => {
    if (realtime.live) return;
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void catchUpRef.current();
    }, FALLBACK_POLL_MS);
    return () => window.clearInterval(poll);
  }, [realtime.live]);

  return { recent };
}
