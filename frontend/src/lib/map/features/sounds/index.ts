/**
 * Module « zones sonores » (docs/carte.md § 10, Zones sonores) : zones posées par le MJ (outil F,
 * glisser-déposer d'un son), entendues par les joueurs selon la position de leur token. La
 * logique est dans `engine/register.ts` et `engine/hearing.ts` (testées sans React) ; ici on y ajoute
 * l'interface, et l'écoute et le dépôt (`MapSounds`, surcouche sans rendu).
 */
import { MapSounds } from './ui/map-sounds';
import { SoundInspector } from './ui/sound-inspector';
import { SoundOptions } from './ui/sound-options';
import type { MapFeature } from '@/lib/map/engine/map-engine';
import { registerSounds } from './engine/register';

export const soundsFeature: MapFeature = {
  id: 'sounds',
  register: (engine) => [
    registerSounds(engine, { options: SoundOptions, inspector: SoundInspector }),
    engine.registerOverlay({ id: 'sounds.listen', slot: 'none', component: MapSounds }),
  ],
};
