/**
 * Module « obstacles » (docs/carte.md § 9, § 10) : murs, portes, fenêtres, murs à sens unique,
 * pièces, et l'outil de pose W. La logique est dans `engine/register.ts` (testée sans React) ; ici on y
 * ajoute l'interface : barre contextuelle et inspecteurs.
 */
import { ObstacleInspector } from './ui/obstacle-inspector';
import { ObstacleOptions } from './ui/obstacle-options';
import { RoomInspector } from './ui/room-inspector';
import type { MapModule } from '@/lib/map/engine/map-engine';
import { registerObstacles } from './engine/register';

export const obstaclesModule: MapModule = {
  id: 'obstacles',
  register: (engine) =>
    registerObstacles(engine, {
      options: ObstacleOptions,
      obstacleInspector: ObstacleInspector,
      roomInspector: RoomInspector,
    }),
};
