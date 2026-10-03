/**
 * Carte affichée dans l'onglet : le moteur monté par `MapCanvas`, pour les panneaux de la
 * table qui vivent hors de la carte (Scènes : point d'apparition, recentrer). Une seule carte
 * à la fois par onglet : un magasin de module suffit (docs/frontend-architecture.md § 3.7).
 */
'use client';

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { MapEngine } from './engine/map-engine';

export interface ActiveMap {
  campaignId: string | null;
  mapId: string | null;
  engine: MapEngine | null;
}

export const activeMapStore = createStore<ActiveMap>()(() => ({
  campaignId: null,
  mapId: null,
  engine: null,
}));

// Tests de bout en bout (e2e/) : la carte est un canevas, ils lisent son état dans le moteur.
// Jamais en production, sauf build de test explicite (`NEXT_PUBLIC_E2E=true`).
if (
  typeof window !== 'undefined' &&
  (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_E2E === 'true')
)
  (window as unknown as { __vttActiveMap?: typeof activeMapStore }).__vttActiveMap = activeMapStore;

/** Enregistre le moteur monté ; renvoie son retrait (seulement s'il est toujours celui-là). */
export function setActiveMap(campaignId: string, mapId: string, engine: MapEngine): () => void {
  activeMapStore.setState({ campaignId, mapId, engine });
  return () => {
    if (activeMapStore.getState().engine === engine)
      activeMapStore.setState({ campaignId: null, mapId: null, engine: null });
  };
}

/** Carte affichée pour cette campagne (null si aucune, ou une autre campagne). */
export function useActiveMap(campaignId: string): ActiveMap {
  const engine = useStore(activeMapStore, (s) => (s.campaignId === campaignId ? s.engine : null));
  const mapId = useStore(activeMapStore, (s) => (s.campaignId === campaignId ? s.mapId : null));
  return { campaignId: engine ? campaignId : null, mapId, engine };
}
