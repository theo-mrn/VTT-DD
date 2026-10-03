/**
 * Module « zones sonores » (docs/carte.md § 10, Zones sonores) : zones posées par le MJ (outil F,
 * glisser-déposer d'un son), entendues par les joueurs selon la position de leur token. La
 * logique est dans `register.ts` et `hearing.ts` (testées sans React) ; ici on y ajoute
 * l'interface.
 */
import { SoundInspector } from '@/components/map/sounds/sound-inspector';
import { SoundOptions } from '@/components/map/sounds/sound-options';
import type { MapModule } from '../../engine/map-engine';
import { registerSounds } from './register';

export const soundsModule: MapModule = {
  id: 'sounds',
  register: (engine) =>
    registerSounds(engine, { options: SoundOptions, inspector: SoundInspector }),
};
