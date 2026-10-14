/**
 * Jet de groupe : le MJ demande un jet à tous les joueurs (« Perception »), chacun le lance
 * d'un clic (lanceur de la table : dés 3D, service dice, historique), et les résultats arrivent
 * au MJ (`table.grouproll.result`, MJ seul) qui les range et les diffuse, ou les garde pour lui.
 */
import { createGmSharedState } from '../shared/gm-state';

export const GROUP_RESULT_KIND = 'table.grouproll.result';

export interface GroupResult {
  userId: string;
  name: string;
  /** Total du jet ; null : caché (résultats gardés par le MJ) ou jet à symboles. */
  total: number | null;
  /** Résultat d'un jet à symboles (« 2 Succès »). */
  symbols: string | null;
  critical: 'success' | 'failure' | null;
}

export interface GroupRoll {
  id: string;
  label: string;
  formula: string;
  /** Les joueurs voient les résultats de tous. */
  shared: boolean;
  /** Joueurs à qui le jet est demandé. */
  targets: string[];
  results: GroupResult[];
  closed: boolean;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

function normalizeResult(raw: unknown): GroupResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<GroupResult>;
  if (typeof r.userId !== 'string') return null;
  return {
    userId: r.userId,
    name: str(r.name, 80),
    total: typeof r.total === 'number' && Number.isFinite(r.total) ? r.total : null,
    symbols: typeof r.symbols === 'string' ? r.symbols.slice(0, 80) : null,
    critical: r.critical === 'success' || r.critical === 'failure' ? r.critical : null,
  };
}

export function normalizeGroupRoll(raw: unknown): GroupRoll | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Partial<GroupRoll>;
  if (typeof g.id !== 'string' || typeof g.formula !== 'string') return null;
  return {
    id: g.id,
    label: str(g.label, 80),
    formula: g.formula.slice(0, 200),
    shared: g.shared !== false,
    targets: Array.isArray(g.targets)
      ? g.targets.filter((x): x is string => typeof x === 'string').slice(0, 50)
      : [],
    results: Array.isArray(g.results)
      ? g.results.map(normalizeResult).filter((r): r is GroupResult => r !== null)
      : [],
    closed: g.closed === true,
  };
}

export const groupRoll = createGmSharedState<GroupRoll>('table.grouproll', {
  decode: normalizeGroupRoll,
  // Résultats gardés par le MJ : les joueurs savent seulement qui a lancé
  share: (g) =>
    g.shared
      ? g
      : {
          ...g,
          results: g.results.map((r) => ({ ...r, total: null, symbols: null, critical: null })),
        },
});

/** Meilleur d'abord ; les résultats cachés ou à symboles à la suite. */
export const ranked = (results: readonly GroupResult[]) =>
  [...results].sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity));

export const groupRollActions = {
  start(label: string, formula: string, shared: boolean, targets: string[]) {
    groupRoll.set({
      id: crypto.randomUUID(),
      label,
      formula,
      shared,
      targets,
      results: [],
      closed: false,
    });
  },
  /** MJ : un résultat reçu (le dernier d'un joueur remplace le précédent). */
  record(rollId: string, result: GroupResult) {
    const g = groupRoll.store.getState().value;
    if (!g || g.id !== rollId || g.closed) return;
    groupRoll.set({
      ...g,
      results: [...g.results.filter((r) => r.userId !== result.userId), result],
    });
  },
  close() {
    const g = groupRoll.store.getState().value;
    if (g) groupRoll.set({ ...g, closed: true });
  },
  clear() {
    groupRoll.set(null);
  },
};
