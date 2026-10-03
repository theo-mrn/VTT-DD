/**
 * Rapports du panneau Combat (docs/combat.md § 7, § 12.4), lus pour la liste, la carte
 * « Cibles (n) », « Tout appliquer (n) » et le compteur « x/y appliqués » :
 *
 * - en attente (par défaut) : les attaques en cours et résolues de toute la campagne, plus
 *   celles décidées sous les yeux du MJ depuis le dernier passage de tour (grisées, avec
 *   « Annuler l'application »), comme l'ancienne app qui les gardait jusqu'à « Suivant » ;
 * - décidés, tous : l'historique, par pages ;
 * - ce combat, hors combat ; un personnage (attaquant, cible ou réattribué).
 */
'use client';

import type { Attack, CombatState } from '@vtt/contracts';
import { useMemo, useRef, useState } from 'react';
import { useAttacks } from '@/lib/combat/use-attacks';
import {
  bulkRows,
  filterByCharacter,
  filterReports,
  isOpen,
  isPending,
  pendingTargetIds,
  recentlyDecided,
  reportCharacters,
  reportItems,
  reportProgress,
  type ReportFilter,
  type ReportScope,
} from './model';

export interface ReportView {
  filter: ReportFilter;
  scope: ReportScope;
  /** Seulement les rapports de ce personnage ; null : tous. */
  characterId: string | null;
}

export const DEFAULT_REPORT_VIEW: ReportView = {
  filter: 'pending',
  scope: 'all',
  characterId: null,
};

const PAGE = 50;

/** Les plus récentes d'abord, sans doublon (une attaque peut venir de deux listes). */
export function mergeAttacks(...lists: (readonly Attack[])[]): Attack[] {
  const byId = new Map<string, Attack>();
  for (const list of lists)
    for (const a of list) {
      const known = byId.get(a.id);
      if (!known || known.version < a.version) byId.set(a.id, a);
    }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function useReports(
  campaignId: string,
  combat: Pick<CombatState, 'id' | 'turn'> | null,
  view: ReportView,
) {
  const [limit, setLimit] = useState(PAGE);
  // En attente : résolues et en cours (toujours chargées : carte « Cibles », revue, pastille)
  const pending = useAttacks(campaignId, { status: 'pending', limit: 100 });
  const open = useAttacks(campaignId, { status: 'open', limit: 50 });
  const decided = useAttacks(campaignId, { status: 'decided', limit: 30 });
  const history = useAttacks(
    campaignId,
    { status: view.filter === 'decided' ? 'decided' : 'all', limit },
    { enabled: view.filter !== 'pending' },
  );

  // Rapports vus en attente dans cette session, et ceux rangés depuis (passage de tour)
  const seenPending = useRef(new Set<string>());
  for (const a of pending.attacks) seenPending.current.add(a.id);
  for (const a of open.attacks) seenPending.current.add(a.id);
  const [cleared, setCleared] = useState<ReadonlySet<string>>(new Set());
  const recent = useMemo(
    () => recentlyDecided(decided.attacks, seenPending.current, cleared),
    // `seenPending` grandit avec `pending` et `open`
    [decided.attacks, cleared, pending.attacks, open.attacks],
  );
  const clearRecent = () => setCleared((c) => new Set([...c, ...recent.map((a) => a.id)]));

  // Le tour passe : les décidés de ce tour sont rangés (l'ancien « Suivant » les purgeait)
  const turn = combat?.turn ?? null;
  const [lastTurn, setLastTurn] = useState(turn);
  if (lastTurn !== turn) {
    setLastTurn(turn);
    setCleared((c) => new Set([...c, ...recent.map((a) => a.id)]));
  }

  const toReview = useMemo(() => pending.attacks.filter(isPending), [pending.attacks]);
  const all = useMemo(() => {
    if (view.filter === 'pending') return mergeAttacks(open.attacks, pending.attacks, recent);
    if (view.filter === 'all') return mergeAttacks(history.attacks, open.attacks, pending.attacks);
    return mergeAttacks(history.attacks);
  }, [view.filter, open.attacks, pending.attacks, recent, history.attacks]);
  const combatId = combat?.id ?? null;
  const scoped = filterReports(
    all,
    view.filter === 'pending' ? 'all' : view.filter,
    view.scope,
    combatId,
  );
  const shown = filterByCharacter(scoped, view.characterId);
  const loading =
    view.filter === 'pending' ? pending.isLoading || open.isLoading : history.isLoading;
  const error = pending.error ?? open.error ?? (view.filter !== 'pending' ? history.error : null);

  return {
    shown,
    items: reportItems(shown),
    progress: reportProgress(shown),
    /** Rapports de la revue groupée (« Tout appliquer »). */
    toReview,
    reviewCount: bulkRows(toReview).length,
    /** Cibles qui attendent une décision (carte « Cibles (n) »). */
    pendingTargets: pendingTargetIds(toReview),
    /** En attente : à décider et en cours. */
    waiting: toReview.length + open.attacks.filter(isOpen).length,
    recentCount: recent.length,
    clearRecent,
    characters: reportCharacters(scoped),
    loading,
    error,
    canLoadMore: view.filter !== 'pending' && history.hasMore && limit < 100,
    loadMore: () => setLimit(100),
    /** Une attaque connue, pour le tiroir de décision. */
    find: (id: string) => all.find((a) => a.id === id) ?? toReview.find((a) => a.id === id) ?? null,
  };
}

export type ReportsData = ReturnType<typeof useReports>;
