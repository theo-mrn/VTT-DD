'use client';

/**
 * Historique des jets d'une campagne : dernière page, puis mises à jour en
 * direct par le service realtime (`dice.rolled`, `dice.roll_deleted`,
 * `dice.history_cleared`), remontée avec `before`. Sans campagne, ce sont les
 * jets personnels de l'utilisateur (événements personnels).
 *
 * Un événement de jet ne sert que de signal : le jet est relu en REST (`after`),
 * qui applique le masquage (jet caché vu par son auteur). Chaque jet n'apparaît
 * qu'une fois (fusion par identifiant). Socket coupé : relecture de secours
 * toutes les 30 s ; à chaque (ré)abonnement sans rejeu, la dernière page est relue.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage } from '@/lib/api';
import { clearRolls, deleteRoll, listRolls, onRollsChanged, type Roll } from '@/lib/dice';
import { useCampaignEvents, type RealtimeEvent } from '@/lib/realtime';

/** Relecture de secours quand le temps réel est coupé (onglet visible). */
const FALLBACK_POLL_MS = 30_000;
const PAGE = 50;
const DICE_EVENTS = ['dice.rolled', 'dice.roll_deleted', 'dice.history_cleared'] as const;

export interface RollHistory {
  /** Du plus ancien au plus récent. */
  rolls: Roll[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlder(): Promise<void>;
  /** Ajoute un jet qui vient d'être enregistré (sans attendre l'événement). */
  push(roll: Roll): void;
  remove(id: string): Promise<void>;
  /** Vide l'historique de la campagne (MJ) ; le polling repart de la dernière page. */
  clear(): Promise<void>;
  refresh(): void;
}

const byDate = (a: Roll, b: Roll) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;

function merge(list: Roll[], incoming: Roll[]): Roll[] {
  if (!incoming.length) return list;
  const map = new Map(list.map((r) => [r.id, r]));
  for (const r of incoming) map.set(r.id, r);
  return [...map.values()].sort(byDate);
}

export function useRollHistory({
  campaignId,
  enabled = true,
  onIncoming,
}: {
  campaignId: string | null;
  enabled?: boolean;
  /** Jets arrivés après la première page (temps réel ou relecture), pour les notifications. */
  onIncoming?(rolls: Roll[]): void;
}): RollHistory {
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Le service ne liste pas (encore) cet historique : on garde les jets de la session
  const [unsupported, setUnsupported] = useState(false);

  const rollsRef = useRef<Roll[]>([]);
  rollsRef.current = rolls;
  const incomingRef = useRef(onIncoming);
  incomingRef.current = onIncoming;
  const inFlight = useRef(false);
  /** Relecture demandée pendant qu'une autre est en cours : relancée ensuite (rien de perdu). */
  const queued = useRef<{ full: boolean } | null>(null);
  const generation = useRef(0);

  /**
   * Relit la dernière page (du plus récent au plus ancien) ; les jets plus
   * anciens qu'elle, déjà remontés, sont gardés, les autres absents sont supprimés.
   */
  const loadLatest = useCallback(async (): Promise<Roll[] | null> => {
    const gen = generation.current;
    const page = await listRolls({ campaignId, limit: PAGE });
    if (gen !== generation.current) return null;
    setRolls((list) => {
      const oldest = page.at(-1)?.createdAt;
      const older = oldest && page.length >= PAGE ? list.filter((r) => r.createdAt < oldest) : [];
      return merge(older, page);
    });
    return page;
  }, [campaignId]);

  const poll = useCallback(
    async (full = false): Promise<void> => {
      if (inFlight.current) {
        queued.current = { full: full || (queued.current?.full ?? false) };
        return;
      }
      inFlight.current = true;
      const gen = generation.current;
      try {
        const known = new Set(rollsRef.current.map((r) => r.id));
        const last = rollsRef.current.at(-1);
        const fresh = last
          ? await listRolls({ campaignId, after: last.id, limit: PAGE })
          : ((await loadLatest()) ?? []);
        if (gen !== generation.current) return;
        if (last && fresh.length) setRolls((list) => merge(list, fresh));
        const added = fresh.filter((r) => !known.has(r.id));
        if (added.length) incomingRef.current?.(added);
        if (full && last) await loadLatest();
        setError(null);
      } catch (e) {
        if (gen !== generation.current) return;
        if (e instanceof ApiError && [400, 404, 422].includes(e.status) && !campaignId)
          setUnsupported(true);
        else setError(errorMessage(e));
      } finally {
        inFlight.current = false;
        const next = queued.current;
        queued.current = null;
        // Version à jour (campagne courante) : une demande faite avant un changement a été oubliée
        if (next) void pollRef.current(next.full);
      }
    },
    [campaignId, loadLatest],
  );
  const pollRef = useRef(poll);
  pollRef.current = poll;

  // Première page
  useEffect(() => {
    generation.current += 1;
    setRolls([]);
    setHasMore(false);
    setError(null);
    setUnsupported(false);
    queued.current = null;
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const gen = generation.current;
    loadLatest()
      .then((page) => {
        if (cancelled || !page) return;
        setHasMore(page.length >= PAGE);
        setError(null);
      })
      .catch((e) => {
        if (cancelled || gen !== generation.current) return;
        if (e instanceof ApiError && [400, 404, 422].includes(e.status) && !campaignId)
          setUnsupported(true);
        else setError(errorMessage(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [campaignId, enabled, loadLatest]);

  /** Historique vidé (par le MJ, ici ou ailleurs) : liste et curseur remis à zéro. */
  const resetList = useCallback(() => {
    generation.current += 1;
    queued.current = null;
    rollsRef.current = [];
    setRolls([]);
    setHasMore(false);
    setError(null);
  }, []);

  // Temps réel : un jet arrivé est relu en REST (masquage), une suppression appliquée telle quelle
  const onDiceEvent = useCallback(
    (e: RealtimeEvent) => {
      switch (e.event.type) {
        case 'dice.rolled':
          void poll();
          return;
        case 'dice.roll_deleted': {
          // L'agrégat est le jet, même dans une version expurgée
          const id = e.event.aggregate.id;
          setRolls((list) => list.filter((r) => r.id !== id));
          return;
        }
        case 'dice.history_cleared':
          resetList();
          void poll();
          return;
      }
    },
    [poll, resetList],
  );
  const realtime = useCampaignEvents(campaignId, DICE_EVENTS, onDiceEvent, {
    enabled: enabled && !unsupported,
  });

  // (Ré)abonnement sans rejeu : ce qui a pu arriver entre-temps est relu
  useEffect(() => {
    if (!enabled || unsupported || !realtime.live || !realtime.generation) return;
    void poll(true);
  }, [enabled, unsupported, realtime.live, realtime.generation, poll]);

  // Secours : relecture lente tant que le temps réel est coupé
  useEffect(() => {
    if (!enabled || unsupported || realtime.live) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll(true);
    }, FALLBACK_POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, unsupported, realtime.live, poll]);

  // Jet d'action enregistré par character depuis cet onglet : relu aussitôt
  useEffect(() => {
    if (!enabled || unsupported) return;
    return onRollsChanged(() => void poll());
  }, [enabled, unsupported, poll]);

  const loadOlder = useCallback(async () => {
    const first = rollsRef.current[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    const gen = generation.current;
    try {
      const page = await listRolls({ campaignId, before: first.id, limit: PAGE });
      if (gen !== generation.current) return;
      setRolls((list) => merge(list, page));
      setHasMore(page.length >= PAGE);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingOlder(false);
    }
  }, [campaignId, loadingOlder]);

  const push = useCallback((roll: Roll) => setRolls((list) => merge(list, [roll])), []);

  const remove = useCallback(async (id: string) => {
    const previous = rollsRef.current;
    setRolls((list) => list.filter((r) => r.id !== id));
    try {
      await deleteRoll(id);
    } catch (e) {
      setRolls(previous);
      setError(errorMessage(e));
    }
  }, []);

  const clear = useCallback(async () => {
    if (!campaignId) return;
    await clearRolls(campaignId);
    // Liste vidée et curseur remis à zéro : le prochain jet relit la dernière page.
    resetList();
  }, [campaignId, resetList]);

  const refresh = useCallback(() => void poll(), [poll]);

  return { rolls, loading, error, hasMore, loadingOlder, loadOlder, push, remove, clear, refresh };
}
