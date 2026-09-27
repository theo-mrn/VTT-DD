'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { isPanelId, TABLE_PARAMS, type PanelId } from './registry';

/**
 * État des panneaux d'une table : le panneau ouvert, ceux déjà montés (gardés en mémoire après
 * leur première ouverture) et les pastilles de non-lus. Un magasin par table (fourni par
 * `PanelStoreProvider`), jamais global : changer de campagne repart de zéro.
 *
 * L'adresse reflète le panneau ouvert (`?panneau=des`) : chaque action l'y écrit, et
 * `syncFromLocation` suit l'adresse quand elle change d'ailleurs (retour arrière, lien direct).
 */

/** Paramètres d'adresse posés avec l'ouverture (`null` retire le paramètre). */
export type PanelParams = Partial<Record<string, string | null>>;

export interface PanelState {
  active: PanelId | null;
  /** Panneaux déjà ouverts une fois, dans l'ordre de première ouverture. */
  mounted: readonly PanelId[];
  /** Nouveautés arrivées panneau fermé. */
  badges: Partial<Record<PanelId, number>>;
  open: (id: PanelId, params?: PanelParams) => void;
  close: () => void;
  /** Reclic sur l'icône du panneau ouvert : il se ferme. */
  toggle: (id: PanelId) => void;
  /** Suit l'adresse, sans la réécrire. */
  syncFromLocation: (id: PanelId | null) => void;
  bumpBadge: (id: PanelId) => void;
}

/** Écrit l'état des panneaux dans l'adresse (historique natif, sans aller-retour serveur). */
export function writePanelLocation(
  active: PanelId | null,
  params: PanelParams = {},
  mode: 'push' | 'replace' = 'replace',
) {
  const url = new URL(window.location.href);
  if (active) url.searchParams.set(TABLE_PARAMS.panel, active);
  else url.searchParams.delete(TABLE_PARAMS.panel);
  for (const [cle, valeur] of Object.entries(params)) {
    if (valeur == null) url.searchParams.delete(cle);
    else url.searchParams.set(cle, valeur);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`)
    return;
  if (mode === 'push') window.history.pushState(null, '', next);
  else window.history.replaceState(null, '', next);
}

/** Panneau demandé par l'adresse courante. */
export function panelFromLocation(search: URLSearchParams): PanelId | null {
  const id = search.get(TABLE_PARAMS.panel);
  return isPanelId(id) ? id : null;
}

const withMounted = (mounted: readonly PanelId[], id: PanelId | null) =>
  !id || mounted.includes(id) ? mounted : [...mounted, id];

function withoutBadge(badges: PanelState['badges'], id: PanelId | null) {
  if (!id || !badges[id]) return badges;
  const { [id]: _lu, ...reste } = badges;
  return reste;
}

export function createPanelStore(initial: PanelId | null): StoreApi<PanelState> {
  return createStore<PanelState>()((set, get) => ({
    active: initial,
    mounted: initial ? [initial] : [],
    badges: {},
    open: (id, params) => {
      const avant = get().active;
      set((s) => ({
        active: id,
        mounted: withMounted(s.mounted, id),
        badges: withoutBadge(s.badges, id),
      }));
      // Depuis la carte, une entrée d'historique : « retour » referme le panneau
      writePanelLocation(id, params, avant === null ? 'push' : 'replace');
    },
    close: () => {
      if (get().active === null) return;
      set({ active: null });
      writePanelLocation(null);
    },
    toggle: (id) => (get().active === id ? get().close() : get().open(id)),
    syncFromLocation: (id) => {
      if (get().active === id) return;
      set((s) => ({
        active: id,
        mounted: withMounted(s.mounted, id),
        badges: withoutBadge(s.badges, id),
      }));
    },
    bumpBadge: (id) => {
      if (get().active === id) return;
      set((s) => ({ badges: { ...s.badges, [id]: (s.badges[id] ?? 0) + 1 } }));
    },
  }));
}

const PanelStoreContext = createContext<StoreApi<PanelState> | null>(null);

export function PanelStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() =>
    createPanelStore(
      typeof window === 'undefined'
        ? null
        : panelFromLocation(new URLSearchParams(window.location.search)),
    ),
  );
  return <PanelStoreContext.Provider value={store}>{children}</PanelStoreContext.Provider>;
}

export function usePanelStoreApi(): StoreApi<PanelState> {
  const store = useContext(PanelStoreContext);
  if (!store) throw new Error('usePanelStore hors de la table de jeu');
  return store;
}

/** Lecture sélective de l'état des panneaux (re-rendu seulement si la sélection change). */
export function usePanelStore<T>(selector: (s: PanelState) => T): T {
  return useStore(usePanelStoreApi(), selector);
}
