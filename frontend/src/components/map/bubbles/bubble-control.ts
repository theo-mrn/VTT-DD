/**
 * Ce que la barre d'outils sait des bulles (bouton « Bulle », K) : le héros que le joueur fait
 * parler, sa bulle en cours, l'ouverture du sélecteur, et l'envoi. Tenu par `MapBubbles`, un
 * magasin par moteur.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { BubbleType } from '@/lib/map/bubbles/bubbles';
import type { MapEngine } from '@/lib/map/engine/map-engine';

export interface BubbleControl {
  /** Héros du joueur ; null : pas de bulle (MJ, spectateur, sans héros). */
  speaker: string | null;
  /** Une bulle de ce héros est affichée. */
  active: boolean;
  open: boolean;
  send(type: BubbleType, content: string, durationMs: number): void;
  clear(): void;
}

const controls = new WeakMap<MapEngine, StoreApi<BubbleControl>>();

export function bubbleControlOf(engine: MapEngine): StoreApi<BubbleControl> {
  let store = controls.get(engine);
  if (!store) {
    store = createStore<BubbleControl>()(() => ({
      speaker: null,
      active: false,
      open: false,
      send: () => undefined,
      clear: () => undefined,
    }));
    controls.set(engine, store);
  }
  return store;
}
