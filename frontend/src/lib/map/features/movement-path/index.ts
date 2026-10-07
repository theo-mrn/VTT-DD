/**
 * Fonction « trajet des déplacements » (docs/carte.md § 10, Trajet des déplacements) : quand
 * on glisse un token, son chemin, les cases traversées et la distance, comparée au déplacement
 * du personnage quand le système le donne ; chez tous pendant le geste (direct), sans jamais
 * révéler un passage qu'un joueur ne voyait pas. Bascule de chacun (⇧T), règle de la table
 * (MJ). La logique est dans `engine/register.ts` (testée sans React) ; ici, l'interface.
 */
import type { MapFeature } from '@/lib/map/engine/map-engine';
import { registerMovementPath } from './engine/register';
import { PathControls } from './ui/path-controls';
import { SpeedFeed } from './ui/speed-feed';

export const movementPathFeature: MapFeature = {
  id: 'movement-path',
  register: (engine) => registerMovementPath(engine, { controls: PathControls, speeds: SpeedFeed }),
};
