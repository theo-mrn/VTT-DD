/**
 * Module « brouillard » (docs/carte.md § 9, § 10) : zones de brouillard (cercle, rectangle, main
 * levée ; ajouter ou retirer), « Tout couvrir » et « Tout découvrir », outil G. La logique est
 * dans `register.ts` (testée sans React) ; ici on y ajoute l'interface.
 */
import { FogInspector } from '@/components/map/fog/fog-inspector';
import { FogOptions } from '@/components/map/fog/fog-options';
import type { MapModule } from '../../engine/map-engine';
import { registerFog } from './register';

export const fogModule: MapModule = {
  id: 'fog',
  register: (engine) => registerFog(engine, { options: FogOptions, inspector: FogInspector }),
};
