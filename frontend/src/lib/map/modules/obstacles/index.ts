/**
 * Module « obstacles » (docs/carte.md § 9, § 10) : murs, portes, fenêtres, murs à sens unique,
 * pièces, et l'outil de pose W. La logique est dans `register.ts` (testée sans React) ; ici on y
 * ajoute l'interface : barre contextuelle et inspecteurs.
 */
import { ObstacleInspector } from '@/components/map/obstacles/obstacle-inspector';
import { ObstacleOptions } from '@/components/map/obstacles/obstacle-options';
import { RoomInspector } from '@/components/map/obstacles/room-inspector';
import type { MapModule } from '../../engine/map-engine';
import { registerObstacles } from './register';

export const obstaclesModule: MapModule = {
  id: 'obstacles',
  register: (engine) =>
    registerObstacles(engine, {
      options: ObstacleOptions,
      obstacleInspector: ObstacleInspector,
      roomInspector: RoomInspector,
    }),
};
