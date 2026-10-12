/**
 * Jetons de destin : une réserve commune (inspiration, points de héros, méta-monnaie) que le MJ
 * remplit et que les joueurs dépensent. Un joueur demande au MJ (`table.fate.spend`, MJ seul),
 * le MJ retire le jeton et diffuse la réserve, avec qui l'a dépensé. Gardée sur son compte.
 */
import { createGmSharedState } from '../shared/gm-state';

export const FATE_SPEND_KIND = 'table.fate.spend';
export const FATE_MAX = 20;

export interface FatePool {
  count: number;
  max: number;
  /** Dernière dépense (pour l'animation et le nom affiché). */
  last: { by: string; at: number } | null;
}

export function normalizeFate(raw: unknown): FatePool | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Partial<FatePool>;
  const max = typeof f.max === 'number' ? Math.max(1, Math.min(FATE_MAX, Math.round(f.max))) : 5;
  const count = typeof f.count === 'number' ? Math.max(0, Math.min(max, Math.round(f.count))) : 0;
  const last =
    f.last && typeof f.last.by === 'string' && typeof f.last.at === 'number'
      ? { by: f.last.by.slice(0, 80), at: f.last.at }
      : null;
  return { count, max, last };
}

export const fate = createGmSharedState<FatePool>('table.fate', {
  decode: normalizeFate,
  persist: 'fate',
});

const pool = () => fate.store.getState().value ?? { count: 0, max: 5, last: null };

export const fateActions = {
  set(change: Partial<Pick<FatePool, 'count' | 'max'>>) {
    const p = pool();
    const max = Math.max(1, Math.min(FATE_MAX, change.max ?? p.max));
    fate.set({ ...p, max, count: Math.max(0, Math.min(max, change.count ?? p.count)) });
  },
  /** MJ : un jeton dépensé par `by` (son nom), s'il en reste. */
  spend(by: string) {
    const p = pool();
    if (p.count <= 0) return false;
    fate.set({ ...p, count: p.count - 1, last: { by, at: Date.now() } });
    return true;
  },
};
