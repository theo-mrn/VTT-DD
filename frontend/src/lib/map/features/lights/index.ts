/**
 * Module « lumières » (docs/carte.md § 9, § 10) : lumières posées, rayon en unités, couleur,
 * intensité, dégradé, allumées ou éteintes, attachées à un token (torche), outil L. La logique
 * est dans `engine/register.ts` (testée sans React) ; ici on y ajoute l'interface.
 *
 * Pour le module vision : `lightPosition(engine, light)` donne la position courante d'une
 * lumière (celle de son token pendant un glisser), `lightRadiusPx(engine, light)` son rayon en
 * pixels du monde.
 */
import { LightInspector } from './ui/light-inspector';
import { LightOptions } from './ui/light-options';
import type { MapFeature } from '@/lib/map/engine/map-engine';
import { registerLights } from './engine/register';

export { lightPosition, lightRadiusPx } from './engine/model';

export const lightsFeature: MapFeature = {
  id: 'lights',
  register: (engine) =>
    registerLights(engine, { options: LightOptions, inspector: LightInspector }),
};
