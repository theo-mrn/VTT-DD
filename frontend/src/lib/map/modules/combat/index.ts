/**
 * Module « combat » de la carte (docs/combat.md § 12.5) : anneau du tour, anneau des cibles
 * (toujours visible), traits de visée en direct (MJ), outil de visée du menu d'attaque, entrées
 * « Attaquer » (token, sélection, gabarit, touche Y). La logique est dans `register.ts` (testée
 * sans React) ; ici on y ajoute l'alimentation de l'état (combat, attaques ouvertes, visées
 * reçues). Le menu d'attaque, lui, s'ouvre en plein écran hors de la carte
 * (`components/combat/attack/attack-menu-host.tsx`) : la carte ne sert qu'à viser.
 */
import { CombatMapFeed } from '@/components/map/combat/combat-feed';
import type { MapModule } from '../../engine/map-engine';
import { registerCombat } from './register';

export const combatModule: MapModule = {
  id: 'combat',
  register: (engine) =>
    registerCombat(engine, {
      overlays: [{ id: 'combat-feed', slot: 'none', component: CombatMapFeed }],
    }),
};
