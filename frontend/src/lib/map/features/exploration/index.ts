/**
 * Module « exploration » de la carte (docs/exploration.md) : la mémoire de ce que le groupe a
 * vu, par scène, montrée grisée par le module vision.
 *
 * - Mémoire du moteur (`explorationOf`) : masque du serveur (chargement de la carte, événements
 *   `map.exploration_updated`) et couche locale pendant un glisser.
 * - Traînées : le chemin d'un glisser est envoyé au lâcher, le serveur explore depuis chacun de
 *   ses points.
 * - Gestes du MJ (outil Brouillard, `engine/memory.ts`) : marquer une zone comme vue ou la faire
 *   oublier ; allumer ou couper la mémoire de la scène, l'effacer.
 *
 * La logique est dans `engine/register.ts` (testée sans React) ; ici on y ajoute l'interface.
 */
import type { MapFeature } from '@/lib/map/engine/map-engine';
import { ExplorationHost } from './ui/exploration-host';
import { registerExploration } from './engine/register';

export const explorationFeature: MapFeature = {
  id: 'exploration',
  register: (engine) => [
    registerExploration(engine),
    engine.registerOverlay({
      id: 'exploration-host',
      slot: 'none',
      component: ExplorationHost,
    }),
  ],
};
