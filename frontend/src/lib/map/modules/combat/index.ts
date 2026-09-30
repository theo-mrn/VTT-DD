/**
 * Module « combat » de la carte (docs/combat.md § 12.5) : anneau du tour, anneau des cibles
 * (toujours visible), traits de visée en direct (MJ), outil de visée du menu d'attaque, entrées
 * « Attaquer » (token, sélection, gabarit, touche Y). La logique est dans `register.ts` (testée
 * sans React) ; ici on y ajoute les surcouches React : l'alimentation de l'état (combat,
 * attaques ouvertes, visées reçues) et le menu d'attaque dans la colonne de gauche.
 */
import { AttackMenuSlot } from '@/components/combat/attack/attack-menu-host';
import { CombatMapFeed } from '@/components/map/combat/combat-feed';
import type { MapModule } from '../../engine/map-engine';
import { registerCombat } from './register';

export const combatModule: MapModule = {
  id: 'combat',
  register: (engine) =>
    registerCombat(engine, {
      overlays: [
        { id: 'combat-feed', slot: 'none', component: CombatMapFeed },
        {
          id: 'attack-menu',
          slot: 'left',
          order: 5,
          available: (viewer) => viewer.role !== 'spectator',
          component: AttackMenuSlot,
        },
      ],
    }),
};
