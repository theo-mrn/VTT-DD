'use client';

/**
 * Outils de sécurité de la table, un standard du JDR :
 * - Carte X : n'importe qui la lève, le MJ seul est prévenu (`table.xcard`, MJ seulement), sans
 *   que l'interface dise qui ; on passe la scène sans explication.
 * - Lignes (jamais en jeu) et voiles (hors champ) : posés par le MJ, lus par tous, gardés sur
 *   son compte pour la campagne.
 */
import { createStore } from 'zustand/vanilla';
import { createGmSharedState } from '../shared/gm-state';

export const XCARD_KIND = 'table.xcard';

export interface Boundaries {
  lines: string[];
  veils: string[];
}

const list = (raw: unknown) =>
  Array.isArray(raw)
    ? raw
        .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        .map((x) => x.slice(0, 120))
        .slice(0, 50)
    : [];

export function normalizeBoundaries(raw: unknown): Boundaries | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<Boundaries>;
  return { lines: list(b.lines), veils: list(b.veils) };
}

export const boundaries = createGmSharedState<Boundaries>('table.boundaries', {
  decode: normalizeBoundaries,
  persist: 'boundaries',
});

/** MJ : cartes X reçues (instant de chacune), affichées jusqu'à ce qu'il les écarte. */
export const xcards = createStore<{ raised: number[] }>(() => ({ raised: [] }));
