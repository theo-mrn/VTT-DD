/**
 * Module « brouillard » (docs/carte.md § 9, § 10) : zones de brouillard (cercle, rectangle, main
 * levée ; ajouter ou retirer), « Tout couvrir » et « Tout découvrir », outil G. La logique est
 * dans `engine/register.ts` (testée sans React) ; ici on y ajoute l'interface.
 */
import { FogInspector } from './ui/fog-inspector';
import { FogOptions } from './ui/fog-options';
import type { MapFeature } from '@/lib/map/engine/map-engine';
import { registerFog } from './engine/register';

export const fogFeature: MapFeature = {
  id: 'fog',
  register: (engine) => registerFog(engine, { options: FogOptions, inspector: FogInspector }),
};
