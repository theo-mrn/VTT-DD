'use client';

/**
 * Historique des jets d'une campagne : dernière page, puis polling `after`
 * toutes les 3 s (onglet visible), remontée avec `before`. Les suppressions
 * faites ailleurs sont rattrapées en relisant la dernière page de temps en
 * temps. Sans campagne, ce sont les jets personnels de l'utilisateur.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage } from '@/lib/api';
import { clearRolls, deleteRoll, listRolls, onRollsChanged, type Roll } from '@/lib/dice';

const POLL_MS = 3000;
/** Toutes les 10 relèves (30 s), la dernière page est relue en entier (suppressions). */
const FULL_EVERY = 10;
const PAGE = 50;

export interface RollHistory {
  /** Du plus ancien au plus récent. */
  rolls: Roll[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlder(): Promise<void>;
  /** Ajoute un jet qui vient d'être enregistré (sans attendre le polling). */
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
  /** Jets arrivés par le polling (pas la première page), pour les notifications. */
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
  const ticks = useRef(0);
  const generation = useRef(0);

  /** Relit la dernière page ; les jets plus anciens déjà remontés sont gardés. */
  const loadLatest = useCallback(async (): Promise<Roll[] | null> => {
    const gen = generation.current;
    const page = await listRolls({ campaignId, limit: PAGE });
    if (gen !== generation.current) return null;
    setRolls((list) => {
      const oldest = page[0]?.createdAt;
      const older = oldest ? list.filter((r) => r.createdAt < oldest) : [];
      return merge(older, page);
    });
    return page;
  }, [campaignId]);

  const poll = useCallback(
    async (full = false) => {
      if (inFlight.current) return;
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
      }
    },
    [campaignId, loadLatest],
  );

  // Première page, puis polling
  useEffect(() => {
    generation.current += 1;
    setRolls([]);
    setHasMore(false);
    setError(null);
    setUnsupported(false);
    ticks.current = 0;
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

  useEffect(() => {
    if (!enabled || unsupported) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      ticks.current += 1;
      void poll(ticks.current % FULL_EVERY === 0);
    }, POLL_MS);
    const offChanged = onRollsChanged(() => void poll());
    return () => {
      window.clearInterval(timer);
      offChanged();
    };
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
    // Liste vidée et curseur remis à zéro : le prochain passage relit la dernière page.
    generation.current += 1;
    ticks.current = 0;
    rollsRef.current = [];
    setRolls([]);
    setHasMore(false);
    setError(null);
  }, [campaignId]);

  const refresh = useCallback(() => void poll(), [poll]);

  return { rolls, loading, error, hasMore, loadingOlder, loadOlder, push, remove, clear, refresh };
}
