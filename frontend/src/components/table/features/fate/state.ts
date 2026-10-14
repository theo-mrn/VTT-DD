/**
 * Jetons de destin : une réserve commune (inspiration, points de héros, méta-monnaie) que le MJ
 * remplit et que chacun dépense. Gardée par le service campaign (état de la table) : une
 * dépense passe par le serveur, qui note qui l'a faite.
 */
import {
  adoptTableState,
  createTableSlice,
  patchTableState,
  tableStateApi,
  tableStateStore,
} from '../shared/table-state';

export const FATE_MAX = 20;

export interface FatePool {
  count: number;
  max: number;
  /** Dernière dépense : qui (utilisateur), quand (instant du serveur, sert d'identifiant). */
  last: { userId: string; at: string } | null;
}

export const fate = createTableSlice<FatePool>(
  (s) => s.fate,
  (p) => ({ fate: p && { count: p.count, max: p.max } }),
);

const pool = () => fate.store.getState().value ?? { count: 0, max: 5, last: null };

export const fateActions = {
  set(change: Partial<Pick<FatePool, 'count' | 'max'>>) {
    const p = pool();
    const max = Math.max(1, Math.min(FATE_MAX, change.max ?? p.max));
    void patchTableState({
      fate: { max, count: Math.max(0, Math.min(max, change.count ?? p.count)) },
    });
  },
  /** Dépense un jeton (joueur ou MJ). */
  async spend() {
    const { campaignId } = tableStateStore.getState();
    if (!campaignId) return;
    adoptTableState(campaignId, await tableStateApi.spendFate(campaignId));
  },
};
