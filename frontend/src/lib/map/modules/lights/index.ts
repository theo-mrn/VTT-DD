/**
 * Module « lumières » (docs/carte.md § 9, § 10) : lumières posées, rayon en unités, couleur,
 * intensité, dégradé, allumées ou éteintes, attachées à un token (torche), outil L. La logique
 * est dans `register.ts` (testée sans React) ; ici on y ajoute l'interface.
 *
 * Pour le module vision : `lightPosition(engine, light)` donne la position courante d'une
 * lumière (celle de son token pendant un glisser), `lightRadiusPx(engine, light)` son rayon en
 * pixels du monde.
 */
import { LightInspector } from '@/components/map/lights/light-inspector';
import { LightOptions } from '@/components/map/lights/light-options';
import type { MapModule } from '../../engine/map-engine';
import { registerLights } from './register';

export { lightPosition, lightRadiusPx } from './model';

export const lightsModule: MapModule = {
  id: 'lights',
  register: (engine) =>
    registerLights(engine, { options: LightOptions, inspector: LightInspector }),
};
