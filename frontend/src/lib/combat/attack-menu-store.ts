/**
 * Menu d'attaque de l'onglet (docs/combat.md § 12.1) : un seul à la fois, gardé hors de React
 * pour que la carte (outil de visée, anneaux des cibles), la fiche et le panneau Combat le
 * pilotent sans se connaître. L'état est celui de la machine `attack-flow.ts`.
 *
 * ```ts
 * openAttackMenu({ campaignId, origin: 'map', targetIds: [characterId] });
 * attackMenu.dispatch({ type: 'toggleTarget', characterId });
 * const flow = useAttackFlow((s) => s);
 * ```
 */
'use client';

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import {
  CLOSED,
  reduceAttackFlow,
  type AttackFlowEvent,
  type AttackFlowState,
  type AttackMenuRequest,
} from './attack-flow';

export interface AttackMenuStore {
  flow: AttackFlowState;
  /** Compteur des ouvertures (un hôte réagit à chaque « Attaquer », même menu déjà ouvert). */
  opens: number;
  /** Hôtes montés par campagne (la table) : sans hôte, « Attaquer » n'est pas proposé. */
  hosts: Readonly<Record<string, number>>;
  dispatch(event: AttackFlowEvent): void;
}

export const attackMenuStore = createStore<AttackMenuStore>()((set, get) => ({
  flow: CLOSED,
  opens: 0,
  hosts: {},
  dispatch: (event) => {
    const next = reduceAttackFlow(get().flow, event);
    if (event.type === 'open') set((s) => ({ flow: next, opens: s.opens + 1 }));
    else if (next !== get().flow) set({ flow: next });
  },
}));

export const attackMenu = {
  dispatch: (event: AttackFlowEvent) => attackMenuStore.getState().dispatch(event),
  get flow(): AttackFlowState {
    return attackMenuStore.getState().flow;
  },
};

/** Ouvre le menu d'attaque (remplace celui qui était ouvert). */
export function openAttackMenu(request: AttackMenuRequest) {
  attackMenu.dispatch({ type: 'open', request });
}

export function closeAttackMenu() {
  attackMenu.dispatch({ type: 'close' });
}

/** Lecture sélective de l'état du menu (re-rendu seulement si la sélection change). */
export function useAttackFlow<T>(selector: (flow: AttackFlowState) => T): T {
  return useStore(attackMenuStore, (s) => selector(s.flow));
}

/** Un hôte du menu est monté pour cette campagne (la table) ; renvoie son retrait. */
export function registerAttackHost(campaignId: string): () => void {
  const bump = (n: number) =>
    attackMenuStore.setState((s) => ({
      hosts: { ...s.hosts, [campaignId]: Math.max(0, (s.hosts[campaignId] ?? 0) + n) },
    }));
  bump(1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    bump(-1);
  };
}

/** Le menu d'attaque peut s'ouvrir pour cette campagne (on est à sa table). */
export function useAttackHost(campaignId: string | null | undefined): boolean {
  return useStore(attackMenuStore, (s) => Boolean(campaignId && s.hosts[campaignId]));
}
