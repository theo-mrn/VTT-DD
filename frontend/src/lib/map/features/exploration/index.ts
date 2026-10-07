/**
 * Module « exploration » de la carte (docs/exploration.md) : la mémoire de ce que le groupe a
 * vu, par scène, montrée grisée par le module vision.
 *
 * - Mémoire du moteur (`explorationOf`) : masque du serveur (chargement de la carte, événements
 *   `map.exploration_updated`) et couche locale pendant un glisser.
 * - Traînées : le chemin d'un glisser est envoyé au lâcher, le serveur explore depuis chacun de
 *   ses points.
 * - Outil Exploration (MJ) : révéler ou oublier une zone, activer ou couper l'exploration de la
 *   scène, la réinitialiser ; la mémoire est surlignée tant qu'il est actif.
 *
 * La logique est dans `engine/register.ts` (testée sans React) ; ici on y ajoute l'interface.
 */
import type { MapFeature } from '@/lib/map/engine/map-engine';
import { ExplorationHost } from './ui/exploration-host';
import { ExplorationOptions } from './ui/exploration-options';
import { registerExploration } from './engine/register';

export const explorationFeature: MapFeature = {
  id: 'exploration',
  register: (engine) => [
    registerExploration(engine, { options: ExplorationOptions }),
    engine.registerOverlay({
      id: 'exploration-host',
      slot: 'none',
      component: ExplorationHost,
    }),
  ],
};
