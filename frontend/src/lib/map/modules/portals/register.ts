/**
 * Branchement du module portails sur le moteur, sans React (docs/carte.md § 10, Portails) :
 * sorte `portal`, outil X, emprunt (proposition au joueur, portails automatiques), destination
 * du portail sélectionné, menus des tokens. L'interface est ajoutée par `index.ts`.
 */
import { DoorOpen, LogIn } from 'lucide-react';
import type { ComponentType } from 'react';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEntity } from '../../engine/entities/entity';
import { isGm } from '../../engine/entities/entity-kind';
import type { InspectorSectionProps, MapEngine } from '../../engine/map-engine';
import { createCommand, tempId, type Persistence } from '../../store/commands';
import type { MapDto } from '../../store/map-store';
import { createPortalApi, type PortalApi } from './api';
import { mountArrival } from './arrival';
import { portalPersistence, remoteReturnCommand } from './commands';
import { portalKind, sceneName, type PortalContext } from './kind';
import {
  hasDestination,
  insidePortal,
  PORTAL_KIND,
  portalLabel,
  PORTALS,
  PORTALS_TOOL_ID,
  roundPoint,
  sceneArrival,
  TOKEN_KIND,
  type PortalData,
  type SceneRef,
} from './model';
import { PortalTool } from './tool';
import { PortalTravel } from './travel';
import { PortalView } from './view';

export interface PortalUi {
  icon?: ComponentType<{ className?: string }>;
  options?: ComponentType<{ engine: MapEngine }>;
  inspector?: ComponentType<InspectorSectionProps>;
  /** Panneau « Destination » (MJ, colonne de gauche). */
  destination?: ComponentType<{ engine: MapEngine }>;
  /** Proposition au joueur, avis du MJ, scènes de la campagne (sans emplacement). */
  host?: ComponentType<{ engine: MapEngine }>;
  openScene?(mapId: string | null): void;
}

/** Contexte du module et état partagé avec l'interface. */
export interface PortalModule extends PortalContext {
  tool(): PortalTool | null;
  scenesStore: StoreApi<{ scenes: readonly SceneRef[] }>;
}

const modules = new WeakMap<MapEngine, PortalModule>();

/** Module portails de ce moteur (interface). */
export const portalModuleOf = (engine: MapEngine) => modules.get(engine) ?? null;

const readOnly: Persistence<MapDto> = {
  update: () => Promise.reject(new Error('Carte en lecture seule')),
};

export function registerPortals(
  engine: MapEngine,
  ui: PortalUi = {},
  deps: { api?: PortalApi } = {},
): () => void {
  const { campaignId, mapId } = engine.store.getState();
  const api = deps.api ?? createPortalApi(campaignId, mapId);
  const base = engine.backend?.collection(PORTALS) ?? readOnly;
  const view = new PortalView(engine);
  const travel = new PortalTravel(engine, api, { notify: (m) => engine.notify(m) });
  const scenesStore = createStore<{ scenes: readonly SceneRef[] }>()(() => ({ scenes: [] }));
  let tool: PortalTool | null = null;

  const ctx: PortalModule = {
    engine,
    api,
    view,
    travel,
    persistence: portalPersistence(base, api),
    scenes: () => scenesStore.getState().scenes,
    scenesStore,
    openScene: ui.openScene,
    tool: () => tool,
    placeReturn: (p) => placeReturn(ctx, p),
  };
  modules.set(engine, ctx);

  const unregister = [
    travel.attach(),
    engine.registerKind(portalKind(ctx)),
    engine.registerTool({
      id: PORTALS_TOOL_ID,
      label: 'Portails',
      icon: ui.icon ?? DoorOpen,
      shortcut: { code: 'KeyX', label: 'X' },
      order: 65,
      available: isGm,
      create: () => (tool = new PortalTool(ctx)),
      options: ui.options,
    }),
    mountArrival(engine, (id) => {
      const drag = tool?.arrivalDrag;
      return drag?.entity.id === id ? drag.target : null;
    }),
    engine.registerMenuProvider(({ entities, viewer }) => tokenMenu(ctx, entities, viewer)),
  ];
  if (ui.inspector)
    unregister.push(
      engine.registerInspectorSection({
        id: 'portal',
        title: 'Portail',
        order: 10,
        appliesTo: (es, viewer) => isGm(viewer) && es.every((e) => e.kind.id === PORTAL_KIND),
        component: ui.inspector,
      }),
    );
  if (ui.destination)
    unregister.push(
      engine.registerOverlay({
        id: 'portal-destination',
        slot: 'left',
        order: 16,
        available: isGm,
        component: ui.destination,
      }),
    );
  if (ui.host)
    unregister.push(
      engine.registerOverlay({
        id: 'portals-host',
        slot: 'none',
        available: (viewer) => viewer.role !== 'spectator',
        component: ui.host,
      }),
    );
  return () => {
    for (const u of unregister.toReversed()) u();
    view.dispose();
    modules.delete(engine);
  };
}

/**
 * Menus des tokens : le MJ fait emprunter un portail de la carte à la sélection ; un joueur
 * emprunte celui où se trouve son token.
 */
function tokenMenu(ctx: PortalModule, entities: readonly MapEntity[], viewer: MapEngine['viewer']) {
  if (!entities.length || !entities.every((e) => e.kind.id === TOKEN_KIND)) return [];
  const portals = ctx.engine
    .entitiesOfKind(PORTAL_KIND)
    .filter((e) => !e.masks.size)
    .map((e) => e.data as PortalData);
  const characterOf = (e: MapEntity) => String((e.data as { characterId?: unknown }).characterId);
  if (isGm(viewer)) {
    const ready = portals.filter(hasDestination);
    if (!ready.length) return [];
    const ids = [...new Set(entities.map(characterOf))];
    return [
      {
        id: 'portal:take',
        label: 'Emprunter un portail',
        icon: DoorOpen,
        children: ready
          .map((p) => ({
            id: `portal:take:${p.id}`,
            label: `${portalLabel(p)} · ${p.kind === 'same_map' ? 'sur la carte' : sceneName(ctx, p.targetMapId)}`,
            run: () => void ctx.travel.use(p, { characterIds: ids }),
          }))
          .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
      },
    ];
  }
  if (viewer.role !== 'player') return [];
  const mine = entities.filter((e) => viewer.characterIds.includes(characterOf(e)));
  return portals.flatMap((p) => {
    const inside = mine.filter((e) => insidePortal(p, e.geometry)).map(characterOf);
    return inside.length
      ? [
          {
            id: `portal:take:${p.id}`,
            label: `Emprunter « ${portalLabel(p)} »`,
            icon: LogIn,
            run: () => void ctx.travel.use(p, { characterIds: inside }),
          },
        ]
      : [];
  });
}

/**
 * Pose le retour d'un portail qui mène quelque part : à son arrivée (sur la carte, ou sur la
 * scène visée : son point d'arrivée des joueurs sans arrivée choisie), relié, mêmes réglages.
 */
function placeReturn(ctx: PortalModule, p: PortalData) {
  const { engine } = ctx;
  if (p.linkedPortalId || !hasDestination(p)) return null;
  const look = {
    name: p.name,
    icon: p.icon,
    color: p.color,
    radius: p.radius,
    visible: p.visible,
    auto: p.auto,
  };
  if (p.kind === 'same_map') {
    const back: PortalData = {
      ...p,
      id: tempId(),
      version: 0,
      updatedAt: '',
      pos: roundPoint(p.target!),
      kind: 'same_map',
      targetMapId: null,
      target: roundPoint(p.pos),
      linkedPortalId: p.id,
    };
    const done = engine.execute(
      createCommand({
        label: 'Poser le retour',
        collection: PORTALS,
        persistence: ctx.persistence,
        items: [back],
      }),
    );
    engine.selection.replace([back.id]);
    return done;
  }
  const scene = ctx.scenes().find((s) => s.id === p.targetMapId);
  const at = p.target ?? (scene ? sceneArrival(scene) : null);
  if (!at) {
    engine.notify('Scène d’arrivée introuvable.');
    return null;
  }
  return engine.execute(
    remoteReturnCommand({
      label: 'Poser le retour',
      api: ctx.api,
      portalId: p.id,
      remote: { mapId: p.targetMapId!, body: { ...look, pos: roundPoint(at) } },
    }),
  );
}
