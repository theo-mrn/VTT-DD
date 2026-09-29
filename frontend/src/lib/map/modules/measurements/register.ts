/**
 * Branchement du module « mesures » sur le moteur, sans React (docs/carte.md § 10, Mesures) :
 * distance au clic. L'interface est ajoutée par `index.ts`.
 */
import type { MapEngine } from '../../engine/map-engine';
import { ClickDistance } from './click-distance';
import { measurePrefs, type MeasurePrefs } from './prefs';
import { ClickDistanceView } from './render';
import type { StoreApi } from 'zustand/vanilla';

/** Contexte du module pour ce moteur (interface, tests). */
export interface MeasureModule {
  engine: MapEngine;
  prefs: StoreApi<MeasurePrefs>;
  clickDistance: ClickDistance;
}

const modules = new WeakMap<MapEngine, MeasureModule>();

/** Module « mesures » de ce moteur (interface). */
export const measureModuleOf = (engine: MapEngine) => modules.get(engine) ?? null;

export function registerMeasurements(engine: MapEngine): () => void {
  const prefs = measurePrefs(engine);
  const clickDistance = new ClickDistance(engine, prefs);
  const ctx: MeasureModule = { engine, prefs, clickDistance };
  modules.set(engine, ctx);
  let clickView: ClickDistanceView | null = null;

  const cleanups: (() => void)[] = [
    engine.onMapClick((click) => clickDistance.onClick(click)),
    // Préférence coupée : la mesure affichée s'efface tout de suite
    prefs.subscribe((s, prev) => {
      if (!s.clickDistance && prev.clickDistance) clickDistance.clear();
    }),
    engine.onFrame((now) => {
      const m = clickDistance.resolve(now);
      clickView?.sync(m, engine.camera.zoom);
      // Une image de plus seulement pendant l'effacement (rendu à la demande)
      return m?.fading === true;
    }),
    engine.whenMounted(() => {
      const pixi = engine.pixi;
      const plane = engine.plane('live');
      const theme = engine.theme;
      if (!pixi || !plane || !theme) return;
      clickView = new ClickDistanceView(pixi, theme, plane);
      engine.invalidate();
      return () => {
        clickView?.destroy();
        clickView = null;
      };
    }),
  ];

  return () => {
    for (const c of cleanups.splice(0).reverse()) c();
    clickDistance.dispose();
    modules.delete(engine);
  };
}
