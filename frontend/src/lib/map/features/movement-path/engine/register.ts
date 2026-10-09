/**
 * Branchement du trajet des déplacements sur le moteur, sans React (docs/carte.md § 10, Trajet
 * des déplacements) : mon trajet (glisser suivi, points de passage, direct), ceux des autres,
 * la bascule (⇧T) et le rendu. L'interface (bouton, règle de la table, déplacement lu dans les
 * fiches) est ajoutée par `index.ts`.
 */
import { translate } from '@/i18n/runtime';
import { Route } from 'lucide-react';
import type { ComponentType } from 'react';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { KindContext } from '@/lib/map/engine/entities/entity-kind';
import type { Point } from '@/lib/map/engine/geometry';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { unitContext } from '@/lib/map/features/measurements/engine/click-distance';
import type { UnitContext } from '@/lib/map/features/measurements/engine/model';
import { measurePrefs, type MeasurePrefs } from '@/lib/map/features/measurements/engine/prefs';
import { stepZoom, zoomStep } from '@/lib/map/features/obstacles/engine/overlay';
import { RemotePaths } from './remote';
import { PathView, type PathLook } from './render';
import { pathPrefs, pathsShown, ruleForced, setPathsShown, tableRule } from './rule';
import { speedDirectory } from './speeds';
import { PathTracker } from './tracker';

/** Bascule de l'affichage des trajets (ma préférence). */
export const TOGGLE_ACTION_ID = 'movement-path.toggle';
export const TOGGLE_SHORTCUT = { code: 'Shift+KeyT', label: '⇧T' };

export interface MovementPathUi {
  /** Bouton « Trajets » et règle de la table (barre d'outils, groupe `assist`). */
  controls?: ComponentType<{ engine: MapEngine }>;
  /** Surcouche sans rendu : le déplacement des personnages, lu dans leurs fiches. */
  speeds?: ComponentType<{ engine: MapEngine }>;
}

export interface MovementPathModule {
  tracker: PathTracker;
  remote: RemotePaths;
}

const modules = new WeakMap<MapEngine, MovementPathModule>();

/** Module du trajet de ce moteur (tests, diagnostic). */
export const movementPathOf = (engine: MapEngine) => modules.get(engine) ?? null;

const noop = () => {};

const characterOf = (e: MapEntity): string | null => {
  const id = (e.data as { characterId?: unknown }).characterId;
  return typeof id === 'string' ? id : null;
};

export function registerMovementPath(engine: MapEngine, ui: MovementPathUi = {}): () => void {
  const tracker = new PathTracker(engine);
  const remote = new RemotePaths();
  const speeds = speedDirectory(engine);
  modules.set(engine, { tracker, remote });

  let mounted: { local: PathView | null; remote: Map<string, PathView>; make(): PathView } | null =
    null;
  let frame = 0;

  // Unités de la carte (case, nom, grille de jeu, comptage des Mesures), gardées tant que ni la
  // carte ni le comptage ne changent : la vue ne redessine que si elles changent
  let unitsFor: { kind: KindContext; prefs: MeasurePrefs; units: UnitContext } | null = null;
  const units = (): UnitContext => {
    const kind = engine.kindContext();
    const prefs = measurePrefs(engine).getState();
    if (unitsFor?.kind !== kind || unitsFor.prefs !== prefs)
      unitsFor = { kind, prefs, units: unitContext(engine) };
    return unitsFor.units;
  };

  // Ce que la vue reçoit, réutilisé d'une image à l'autre
  const look: PathLook = {
    points: [],
    end: { x: 0, y: 0 },
    revision: 0,
    radius: 0,
    speed: null,
    units: null as unknown as UnitContext,
    zoom: 1,
    alpha: 1,
  };
  const fill = (
    points: readonly Point[],
    end: Point,
    revision: number,
    entity: MapEntity,
    alpha: number,
  ) => {
    look.points = points;
    look.end = end;
    look.revision = revision;
    look.radius = entity.current.width / 2;
    look.speed = speeds.get(characterOf(entity));
    look.alpha = alpha;
    return look;
  };

  const draw = (now: number): boolean => {
    const m = mounted;
    let fading = tracker.tick(now);
    if (!m) return remote.forEach(engine, now, noop) || fading;
    frame += 1;
    if (pathsShown(engine)) {
      look.zoom = stepZoom(zoomStep(engine.camera.zoom));
      look.units = units();
      const local = tracker.resolve(now);
      const token = local && engine.entity(local.entityId);
      if (local && token) {
        m.local ??= m.make();
        m.local.seen = frame;
        m.local.sync(fill(local.points, local.end, local.revision, token, local.alpha));
      }
      fading =
        remote.forEach(engine, now, (p) => {
          let view = m.remote.get(p.entityId);
          if (!view) m.remote.set(p.entityId, (view = m.make()));
          view.seen = frame;
          view.sync(fill(p.points, p.entity.current, p.revision, p.entity, p.alpha));
        }) || fading;
    } else fading = remote.forEach(engine, now, noop) || fading;
    // Vues sans trajet à cette image : détruites
    if (m.local && m.local.seen !== frame) {
      m.local.destroy();
      m.local = null;
    }
    for (const [id, view] of m.remote)
      if (view.seen !== frame) {
        view.destroy();
        m.remote.delete(id);
      }
    return fading;
  };

  const cleanups: (() => void)[] = [
    engine.onDrag((e) => tracker.onDrag(e)),
    engine.onGestureInput((i) => tracker.input(i)),
    engine.onFrame(draw),
    pathPrefs(engine).subscribe(() => engine.invalidate()),
    speeds.subscribe(() => engine.invalidate()),
    engine.registerAction({
      id: TOGGLE_ACTION_ID,
      label: translate('map.actions.movementPathToggle'),
      icon: Route,
      shortcut: TOGGLE_SHORTCUT,
      run: (e) => {
        // Règle de la table posée par le MJ : elle décide pour les joueurs
        if (ruleForced(e, tableRule(e.store.getState().scene))) return;
        setPathsShown(e, !pathPrefs(e).getState().shown);
      },
    }),
    engine.whenMounted(() => {
      const pixi = engine.pixi;
      const theme = engine.theme;
      const grid = engine.plane('grid');
      const live = engine.plane('live');
      if (!pixi || !theme || !grid || !live) return;
      const views = {
        local: null as PathView | null,
        remote: new Map<string, PathView>(),
        make: () => new PathView(pixi, theme, grid, live),
      };
      mounted = views;
      engine.invalidate();
      return () => {
        views.local?.destroy();
        for (const v of views.remote.values()) v.destroy();
        views.remote.clear();
        mounted = null;
      };
    }),
  ];
  if (engine.live)
    cleanups.push(
      engine.live.onPath((e) => {
        remote.handle(e, engine.now());
        engine.invalidate();
      }),
    );
  if (ui.controls)
    cleanups.push(
      engine.registerToolbarEntry({
        kind: 'custom',
        id: 'movement-path:menu',
        label: translate('map.actions.movementPathToggle'),
        icon: Route,
        group: 'assist',
        order: 15,
        component: ui.controls,
      }),
    );
  if (ui.speeds)
    cleanups.push(
      engine.registerOverlay({
        id: 'movement-path:speeds',
        slot: 'none',
        available: (viewer) => viewer.role !== 'spectator',
        component: ui.speeds,
      }),
    );

  return () => {
    for (const c of cleanups.splice(0).reverse()) c();
    tracker.dispose();
    remote.clear();
    modules.delete(engine);
  };
}
