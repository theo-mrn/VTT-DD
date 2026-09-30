/**
 * Branchement du module « combat » sur le moteur, sans React (docs/combat.md § 12.5) :
 * - état des surcouches (tour, cibles des attaques ouvertes, visées), alimenté par React ;
 * - entrées « Attaquer » du menu et de la barre de la sélection, touche Y ;
 * - outil de visée (hors barre), piloté par le menu d'attaque (`attack-menu-store`) ;
 * - anneaux et traits de visée, badges d'états des tokens (plan `adornments`).
 * L'interface (surcouches React) est ajoutée par `index.ts`.
 */
import { Crosshair } from 'lucide-react';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEngine, MapOverlay } from '../../engine/map-engine';
import { SELECT_TOOL_ID } from '../../engine/tools/tool-manager';
import {
  attackMenuStore,
  openAttackMenu,
  type AttackMenuStore,
} from '@/lib/combat/attack-menu-store';
import {
  aimContinues,
  type AttackFlowEvent,
  type AttackFlowState,
  type AttackMenuRequest,
} from '@/lib/combat/attack-flow';
import { AIM_TOOL_ID, AimTool } from './aim-tool';
import { attackSelection, combatMenu, quickAimTarget, type AttackOpener } from './menu';
import { aimLines, EMPTY_COMBAT_MAP, ringTargets, type CombatMapState } from './model';
import { mountStateBadges } from './badges';
import { mountCombatRings, type RingSnapshot } from './rings';

export interface CombatUi {
  /** Surcouches React : alimentation de l'état, menu d'attaque. */
  overlays?: readonly MapOverlay[];
}

/** Ce que le module attend du menu d'attaque (le magasin de l'onglet par défaut). */
export interface AttackMenuPort {
  getState(): Pick<AttackMenuStore, 'flow'>;
  subscribe(listener: (s: Pick<AttackMenuStore, 'flow'>) => void): () => void;
  dispatch(event: AttackFlowEvent): void;
  open(request: AttackMenuRequest): void;
}

const defaultPort: AttackMenuPort = {
  getState: () => attackMenuStore.getState(),
  subscribe: (l) => attackMenuStore.subscribe(l),
  dispatch: (e) => attackMenuStore.getState().dispatch(e),
  open: (r) => openAttackMenu(r),
};

export interface CombatModule {
  engine: MapEngine;
  state: StoreApi<CombatMapState>;
}

const modules = new WeakMap<MapEngine, CombatModule>();

/** Module « combat » de ce moteur (surcouches React, tests). */
export const combatModuleOf = (engine: MapEngine) => modules.get(engine) ?? null;

/** Brouillon du menu d'attaque pour cette campagne (composition en cours), sinon null. */
function draftOf(flow: AttackFlowState, campaignId: string) {
  if (flow.phase === 'closed' || flow.campaignId !== campaignId) return null;
  if (flow.phase !== 'compose' && flow.phase !== 'submitting') return null;
  return flow.draft;
}

export function registerCombat(
  engine: MapEngine,
  ui: CombatUi = {},
  menu: AttackMenuPort = defaultPort,
): () => void {
  const campaignId = engine.store.getState().campaignId;
  const state = createStore<CombatMapState>()(() => EMPTY_COMBAT_MAP);
  modules.set(engine, { engine, state });
  const open: AttackOpener = (request) => menu.open({ ...request, campaignId });

  // ── Outil de visée : suit l'état du menu (« Viser sur la carte »), et inversement ──
  const aiming = () => {
    const f = menu.getState().flow;
    return f.phase === 'compose' && f.campaignId === campaignId && f.aiming;
  };
  const syncTool = () => {
    const active = engine.tools.getActiveId() === AIM_TOOL_ID;
    if (aiming() && !active) {
      if (!engine.tools.activate(AIM_TOOL_ID)) menu.dispatch({ type: 'aim', on: false });
    } else if (!aiming() && active) engine.tools.activate(SELECT_TOOL_ID);
  };

  // ── Anneaux : état du combat + brouillon du menu ──
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };
  const snapshot = (): RingSnapshot => {
    const s = state.getState();
    const draft = draftOf(menu.getState().flow, campaignId);
    return {
      turnCharacterId: s.turnCharacterId,
      mine: engine.viewer.characterIds,
      targets: ringTargets(s, draft?.targetIds ?? []),
      lines: aimLines(
        s,
        draft?.attackerId ? { attackerId: draft.attackerId, targetIds: draft.targetIds } : null,
      ),
      defeated: new Set(s.defeatedIds),
    };
  };

  const cleanups: (() => void)[] = [
    engine.registerTool({
      id: AIM_TOOL_ID,
      label: 'Viser',
      icon: Crosshair,
      hidden: true,
      available: (viewer) => viewer.role !== 'spectator',
      create: () =>
        new AimTool({
          pick: (characterId, shift) => {
            menu.dispatch({ type: 'aimPick', characterId, shift });
            return aimContinues(menu.getState().flow, shift);
          },
          // Visée rapide : un clic dans le vide annule ; depuis le menu, il ne fait rien
          voidClick: () => {
            const f = menu.getState().flow;
            if (f.phase === 'compose' && f.aiming && f.aimMode === 'quick')
              menu.dispatch({ type: 'aimCancel' });
          },
          // Échap, autre outil : retour au menu (ou attaque annulée en visée rapide)
          exit: () => {
            if (aiming() && engine.tools.getActiveId() !== AIM_TOOL_ID)
              menu.dispatch({ type: 'aimCancel' });
          },
        }),
    }),
    // Joueur : un clic sur un PNJ qu'il voit ouvre la visée rapide, ce PNJ en cible (§ 12.1)
    engine.onMapClick((click) => {
      if (menu.getState().flow.phase !== 'closed') return;
      const target = quickAimTarget(engine, click);
      if (!target) return;
      engine.selection.clear();
      open({ origin: 'map', targetIds: [target], aim: true });
    }),
    engine.registerMenuProvider((ctx) => combatMenu(ctx, open)),
    engine.registerShortcut({
      code: 'KeyY',
      available: (viewer) => viewer.role !== 'spectator',
      run: () => attackSelection(engine, open),
    }),
    menu.subscribe(() => {
      syncTool();
      notify();
    }),
    state.subscribe((s, prev) => {
      // Les badges d'états ont leur propre abonnement : les anneaux ne se refont pas pour eux
      if (
        s.turnCharacterId !== prev.turnCharacterId ||
        s.openTargetIds !== prev.openTargetIds ||
        s.aims !== prev.aims ||
        s.defeatedIds !== prev.defeatedIds
      )
        notify();
    }),
    mountCombatRings(engine, {
      snapshot,
      subscribe: (l) => {
        listeners.add(l);
        return () => void listeners.delete(l);
      },
    }),
    mountStateBadges(engine, {
      snapshot: () => state.getState().states,
      subscribe: (l) =>
        state.subscribe((s, prev) => {
          if (s.states !== prev.states) l();
        }),
    }),
    ...(ui.overlays ?? []).map((o) => engine.registerOverlay(o)),
  ];
  syncTool();

  return () => {
    for (const c of cleanups.reverse()) c();
    listeners.clear();
    if (modules.get(engine)?.state === state) modules.delete(engine);
    // Le menu reste ouvert (autre scène, ou sans carte) : la visée, elle, s'arrête
    if (aiming()) menu.dispatch({ type: 'aim', on: false });
  };
}
