/**
 * Branchement du module obstacles sur le moteur, sans React : sortes `obstacle` et `room`,
 * outil W. L'interface (barre contextuelle, inspecteur) est ajoutée par `index.ts` ; les tests
 * s'en passent.
 */
import { BrickWall } from 'lucide-react';
import type { ComponentType } from 'react';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { InspectorSectionProps, MapEngine } from '@/lib/map/engine/map-engine';
import type { Persistence } from '@/lib/map/store/commands';
import { echoPersistence } from './commands';
import { obstacleKind, roomKind, type ObstacleContext } from './kinds';
import {
  OBSTACLE_KIND,
  OBSTACLES,
  OBSTACLES_TOOL_ID,
  ROOM_KIND,
  ROOMS,
  type ObstacleData,
  type RoomData,
} from './model';
import { ObstacleTool } from './tool';
import { ObstacleView } from './view';

export interface ObstacleUi {
  options?: ComponentType<{ engine: MapEngine }>;
  obstacleInspector?: ComponentType<InspectorSectionProps>;
  roomInspector?: ComponentType<InspectorSectionProps>;
}

const contexts = new WeakMap<MapEngine, ObstacleContext>();

/** Contexte du module pour ce moteur (interface : inspecteur, barre contextuelle). */
export const obstacleContextOf = (engine: MapEngine) => contexts.get(engine) ?? null;

export function registerObstacles(engine: MapEngine, ui: ObstacleUi = {}): () => void {
  const persistences = {
    obstacles: (engine.backend?.collection(OBSTACLES) ??
      echoPersistence()) as Persistence<ObstacleData>,
    rooms: (engine.backend?.collection(ROOMS) ?? echoPersistence()) as Persistence<RoomData>,
  };
  const view = new ObstacleView(engine);
  const ctx: ObstacleContext = { engine, view, persistences };
  contexts.set(engine, ctx);
  const unregister = [
    engine.registerKind(obstacleKind(ctx)),
    engine.registerKind(roomKind(ctx)),
    engine.registerTool({
      id: OBSTACLES_TOOL_ID,
      label: 'Obstacles',
      icon: BrickWall,
      shortcut: { code: 'KeyW', label: 'W' },
      order: 70,
      available: isGm,
      create: () => new ObstacleTool(ctx),
      options: ui.options,
    }),
  ];
  if (ui.obstacleInspector)
    unregister.push(
      engine.registerInspectorSection({
        id: 'obstacle',
        title: 'Obstacle',
        order: 10,
        appliesTo: (es, viewer) => isGm(viewer) && es.every((e) => e.kind.id === OBSTACLE_KIND),
        component: ui.obstacleInspector,
      }),
    );
  if (ui.roomInspector)
    unregister.push(
      engine.registerInspectorSection({
        id: 'room',
        title: 'Pièce',
        order: 10,
        appliesTo: (es, viewer) => isGm(viewer) && es.length === 1 && es[0]!.kind.id === ROOM_KIND,
        component: ui.roomInspector,
      }),
    );
  return () => {
    for (const u of unregister.toReversed()) u();
    view.dispose();
    contexts.delete(engine);
  };
}
