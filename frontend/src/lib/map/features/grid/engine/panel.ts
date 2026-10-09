/**
 * Panneau « Échelle et quadrillage » (MJ, docs/carte.md § 4) : son ouverture sur mon écran, et
 * les écritures qu'il fait (quadrillage de la scène, distance par case, réglages de la
 * campagne), chacune annulable ou rétablie en cas d'échec.
 */
import { translate } from '@/i18n/runtime';
import { playGridOf, type MapGrid, type MapScale } from '@vtt/contracts';
import { toast } from 'sonner';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { mapsApi } from '@/lib/map/api';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { SettingsLike } from '@/lib/map/store/map-store';
import { newGrid, withGrid } from './model';
import { gridsOf, saveGrids } from './state';

const panels = new WeakMap<MapEngine, StoreApi<{ open: boolean }>>();

export function scalePanelOf(engine: MapEngine): StoreApi<{ open: boolean }> {
  let store = panels.get(engine);
  if (!store) {
    store = createStore<{ open: boolean }>()(() => ({ open: false }));
    panels.set(engine, store);
  }
  return store;
}

/** Ouvre, ferme ou bascule (sans argument) le panneau. */
export function toggleScalePanel(engine: MapEngine, open?: boolean) {
  scalePanelOf(engine).setState((s) => ({ open: open ?? !s.open }));
}

/** Case de la scène fixée à `size` px : le quadrillage, créé caché aux joueurs au besoin. */
export function setCellSize(engine: MapEngine, size: number) {
  const grids = gridsOf(engine);
  const play = playGridOf({ grids });
  const rounded = Math.round(size * 100) / 100;
  if (play)
    return saveGrids(
      engine,
      translate('map.grid.cellSize'),
      withGrid(grids, play.id, { size: rounded }),
    );
  const created = newGrid([], rounded);
  if (!created) return null;
  return saveGrids(engine, translate('map.grid.cellSize'), [
    { ...created, visibleToPlayers: false },
  ]);
}

/** Retour à l'automatique : le quadrillage est retiré, la case suit la largeur du fond. */
export function automaticCell(engine: MapEngine) {
  if (!gridsOf(engine).length) return null;
  return saveGrids(engine, translate('map.grid.autoScale'), []);
}

/** Modifie le quadrillage de la scène (une commande annulable). */
export function patchGrid(engine: MapEngine, label: string, patch: Partial<Omit<MapGrid, 'id'>>) {
  const grids = gridsOf(engine);
  const play = playGridOf({ grids });
  if (!play) return null;
  return saveGrids(engine, label, withGrid(grids, play.id, patch));
}

/**
 * Réglages de carte de la campagne (distance par case, unité, diagonales, taille des tokens) :
 * appliqués tout de suite, rétablis si l'enregistrement échoue.
 */
export function patchCampaignSettings(engine: MapEngine, patch: Partial<SettingsLike>) {
  const s = engine.store.getState();
  const campaignId = s.campaignId;
  if (!campaignId) return;
  const before: Partial<SettingsLike> = {};
  for (const key of Object.keys(patch)) before[key] = s.settings?.[key];
  s.patchSettings(patch);
  mapsApi.updateSettings(campaignId, patch as never).catch(() => {
    engine.store.getState().patchSettings(before);
    toast.error(translate('map.grid.settingsFailed'));
  });
}

/** Distance par case propre à la scène ; null : celle de la campagne (commande annulable). */
export function setSceneScale(engine: MapEngine, scale: MapScale | null) {
  return engine.updateScene(translate('map.grid.distance'), { scale });
}
