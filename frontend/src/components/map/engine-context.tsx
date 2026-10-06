'use client';

/**
 * Accès React au moteur de la carte. Le moteur vit hors de React (`lib/map/engine`) : les
 * composants (barre d'outils, menus, inspecteur, panneaux des modules) le lisent par
 * sélecteurs, avec des instantanés stables, et ne se re-rendent que si la valeur choisie
 * change. Un `mousemove` ne re-rend jamais React.
 */
import { createContext, useContext, useRef, useSyncExternalStore, type RefObject } from 'react';
import { useStore } from 'zustand';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { EngineExtensions, MapEngine, MapUiState } from '@/lib/map/engine/map-engine';
import type { ToolDefinition } from '@/lib/map/engine/tools/tool';
import type { CommandManagerSnapshot } from '@/lib/map/store/commands';
import type { MapStoreState } from '@/lib/map/store/map-store';

const EngineContext = createContext<MapEngine | null>(null);

export const MapEngineProvider = EngineContext.Provider;

const HostContext = createContext<RefObject<HTMLElement | null> | null>(null);

/** Élément qui porte la carte (gestes, dépôt de fichiers, position des bulles). */
export const MapHostProvider = HostContext.Provider;

/** Élément hôte de la carte ; n'existe que sous `MapCanvas`. */
export function useMapHost(): RefObject<HTMLElement | null> {
  const host = useContext(HostContext);
  if (!host) throw new Error('useMapHost hors de la carte');
  return host;
}

/** Le moteur de la carte affichée ; n'existe que sous `MapCanvas`. */
export function useMapEngine(): MapEngine {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error('useMapEngine hors de la carte');
  return engine;
}

/** État de l'interface du moteur (menu, inspecteur, calques…), par sélecteur. */
export function useMapUi<T>(selector: (s: MapUiState) => T): T {
  return useStore(useMapEngine().ui, selector);
}

/** Magasin de la carte (scène, réglages, couches), par sélecteur à instantané stable. */
export function useMapState<T>(selector: (s: MapStoreState) => T): T {
  return useStore(useMapEngine().store, selector);
}

/** Identifiants sélectionnés (tableau stable entre deux changements). */
export function useSelectionIds(): readonly string[] {
  const { selection } = useMapEngine();
  return useSyncExternalStore(selection.subscribe, selection.getSnapshot, selection.getSnapshot);
}

/** Sections d'inspecteur et entrées de barre d'outils enregistrées par les modules. */
export function useExtensions(): EngineExtensions {
  const engine = useMapEngine();
  return useSyncExternalStore(
    engine.subscribeExtensions,
    engine.getExtensions,
    engine.getExtensions,
  );
}

/** Outil actif. */
export function useActiveToolId(): string {
  const { tools } = useMapEngine();
  return useSyncExternalStore(tools.subscribe, tools.getActiveId, tools.getActiveId);
}

/** Outils enregistrés, dans l'ordre de la barre. */
export function useToolDefinitions(): readonly ToolDefinition[] {
  const { tools } = useMapEngine();
  return useSyncExternalStore(tools.subscribe, tools.getDefinitions, tools.getDefinitions);
}

/** Annuler, refaire, envois en cours. */
export function useCommandsState(): CommandManagerSnapshot {
  const { commands } = useMapEngine();
  return useSyncExternalStore(commands.subscribe, commands.getSnapshot, commands.getSnapshot);
}

/**
 * Entités par identifiants, relues quand leur donnée change (inspecteur). Le tableau renvoyé
 * ne change que si une entité apparaît, disparaît ou reçoit une nouvelle donnée.
 */
export function useEntities(ids: readonly string[] | null): readonly MapEntity[] {
  const engine = useMapEngine();
  const cache = useRef<{ key: readonly unknown[]; value: readonly MapEntity[] }>({
    key: [],
    value: [],
  });
  const snapshot = () => {
    const entities = (ids ?? []).flatMap((id) => {
      const e = engine.entity(id);
      return e ? [e] : [];
    });
    const key = entities.flatMap((e) => [e, e.data]);
    const prev = cache.current;
    if (key.length === prev.key.length && key.every((k, i) => k === prev.key[i])) return prev.value;
    cache.current = { key, value: entities };
    return entities;
  };
  return useSyncExternalStore(engine.store.subscribe, snapshot, snapshot);
}
