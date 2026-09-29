/**
 * Branchement du module « mesures » sur le moteur, sans React (docs/carte.md § 10, Mesures) :
 * distance au clic, outil Mesurer (Z), mesures des autres (direct), gabarits épinglés (sorte
 * `measurement`). L'interface est ajoutée par `index.ts`.
 */
import { Ruler } from 'lucide-react';
import type { ComponentType } from 'react';
import { createStore } from 'zustand/vanilla';
import type { InspectorSectionProps, MapEngine } from '../../engine/map-engine';
import type { MapDto } from '../../store/map-store';
import { echoPersistence } from '../obstacles/commands';
import { ClickDistance } from './click-distance';
import type { LocalState, MeasureModule } from './context';
import { measurementKind, TemplateView } from './kind';
import { MeasureLayer } from './layer';
import { EPHEMERAL_MS, IDLE_MS, PIN_SETTLE_MS, RemoteMeasures } from './live-measures';
import { MEASURE_TOOL_ID, MEASUREMENT_KIND, MEASUREMENTS, type MeasurementData } from './model';
import { editable, measurementPersistence } from './operations';
import { measurePrefs } from './prefs';
import { ClickDistanceView } from './render';
import { measureSettings } from './settings';
import { SkinTextures } from './skins';
import { MeasureTool } from './tool';

export type { MeasureModule } from './context';

export interface MeasureUi {
  icon?: ComponentType<{ className?: string }>;
  /** Barre de l'outil Z. */
  options?: ComponentType<{ engine: MapEngine }>;
  /** Inspecteur d'un gabarit. */
  inspector?: ComponentType<InspectorSectionProps>;
  /** « Épingler » au bout de ma mesure récente (surcouche sans emplacement). */
  host?: ComponentType<{ engine: MapEngine }>;
}

const modules = new WeakMap<MapEngine, MeasureModule & { tool(): MeasureTool | null }>();

/** Module « mesures » de ce moteur (interface, tests). */
export const measureModuleOf = (engine: MapEngine) => modules.get(engine) ?? null;

export function registerMeasurements(engine: MapEngine, ui: MeasureUi = {}): () => void {
  const prefs = measurePrefs(engine);
  const base = engine.backend?.collection(MEASUREMENTS) ?? echoPersistence();
  let tool: MeasureTool | null = null;
  const ctx: MeasureModule & { tool(): MeasureTool | null } = {
    engine,
    prefs,
    settings: measureSettings(engine),
    clickDistance: null as unknown as ClickDistance,
    remote: new RemoteMeasures(),
    local: createStore<LocalState>()(() => ({ measure: null })),
    persistence: measurementPersistence(base as never),
    tool: () => tool,
  };
  ctx.clickDistance = new ClickDistance(engine, prefs);
  modules.set(engine, ctx);
  const skins = new SkinTextures(engine);
  skins.setAnimate(prefs.getState().animateSkins);
  const view = new TemplateView(ctx, skins);
  let clickView: ClickDistanceView | null = null;
  let layer: MeasureLayer | null = null;

  // Gabarits connus : un gabarit qui arrive pose le fantôme épinglé de son auteur
  let known = engine.store.getState().collections[MEASUREMENTS];

  const cleanups: (() => void)[] = [
    engine.registerKind(measurementKind(ctx, view)),
    engine.registerTool({
      id: MEASURE_TOOL_ID,
      label: 'Mesurer',
      icon: ui.icon ?? Ruler,
      shortcut: { code: 'KeyZ', label: 'Z' },
      order: 20,
      available: (viewer) => viewer.role !== 'spectator',
      create: () => (tool = new MeasureTool(ctx)),
      options: ui.options,
    }),
    engine.onMapClick((click) => ctx.clickDistance.onClick(click)),
    prefs.subscribe((s, prev) => {
      // Préférence coupée : la mesure affichée s'efface tout de suite
      if (!s.clickDistance && prev.clickDistance) ctx.clickDistance.clear();
      if (s.counting !== prev.counting) view.refreshAll();
      if (s.animateSkins !== prev.animateSkins) skins.setAnimate(s.animateSkins);
    }),
    // Un effet animé arrivé : les gabarits qui l'attendent se redessinent
    skins.onReady(() => view.refreshAll()),
    engine.store.subscribe((s) => {
      const items = s.collections[MEASUREMENTS];
      if (items === known) return;
      const before = known;
      known = items;
      for (const [id, item] of items ?? []) {
        if (before?.has(id)) continue;
        const m = item as MapDto & Partial<MeasurementData>;
        if (m.start) ctx.remote.arrived(m.createdBy, m.start);
      }
      engine.invalidate();
    }),
    engine.onFrame((now) => {
      const m = ctx.clickDistance.resolve(now);
      clickView?.sync(m, engine.camera.zoom);
      const fading = layer?.sync(now, engine.camera.zoom) ?? false;
      // Une image de plus seulement pendant un effacement (rendu à la demande)
      return m?.fading === true || fading;
    }),
    engine.whenMounted(() => {
      const pixi = engine.pixi;
      const plane = engine.plane('live');
      const theme = engine.theme;
      if (!pixi || !plane || !theme) return;
      layer = new MeasureLayer(ctx, pixi, theme, plane, skins);
      clickView = new ClickDistanceView(pixi, theme, plane);
      engine.invalidate();
      return () => {
        layer?.destroy();
        layer = null;
        clickView?.destroy();
        clickView = null;
      };
    }),
  ];
  if (engine.live) {
    // Rendu à la demande : une image quand une mesure reçue doit s'effacer (un réveil par auteur)
    const wakes = new Map<string, ReturnType<typeof setTimeout>>();
    const wakeIn = (userId: string, ms: number) => {
      const before = wakes.get(userId);
      if (before) clearTimeout(before);
      wakes.set(
        userId,
        setTimeout(() => {
          wakes.delete(userId);
          engine.invalidate();
        }, ms + 20),
      );
    };
    cleanups.push(
      engine.live.onMeasure((e) => {
        ctx.remote.handle(e, engine.now());
        const r = ctx.remote.get(e.userId);
        if (r)
          wakeIn(e.userId, !r.ended ? IDLE_MS : r.measure.pinned ? PIN_SETTLE_MS : EPHEMERAL_MS);
        engine.invalidate();
      }),
      () => {
        for (const t of wakes.values()) clearTimeout(t);
        wakes.clear();
      },
    );
  }
  if (ui.inspector)
    cleanups.push(
      engine.registerInspectorSection({
        id: 'measurement',
        title: 'Gabarit',
        order: 10,
        appliesTo: (es) =>
          es.length > 0 &&
          es.every((e) => e.kind.id === MEASUREMENT_KIND) &&
          editable(engine, es).length === es.length,
        component: ui.inspector,
      }),
    );
  if (ui.host)
    cleanups.push(
      engine.registerOverlay({
        id: 'measure-host',
        slot: 'none',
        available: (viewer) => viewer.role !== 'spectator',
        component: ui.host,
      }),
    );

  return () => {
    for (const c of cleanups.splice(0).reverse()) c();
    tool?.dispose();
    view.dispose();
    skins.dispose();
    ctx.clickDistance.dispose();
    ctx.remote.clear();
    modules.delete(engine);
  };
}
