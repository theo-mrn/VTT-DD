import type { CharacterCreationRule } from '@/modules/game-system/types';

const ABILITY_KEYS = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'];

// Miroir exact de rollStats() dans app/creation/page.tsx : tirage 3d6 par ability,
// retenu seulement si 3 valeurs paires / 3 impaires et somme des modificateurs = +6.
export const DND_CLASSIC_CREATION: CharacterCreationRule = {
  method: 'roll',
  rollFormula: { type: 'dice', notation: '3d6' },
  rollConstraints: [
    {
      id: 'evenCount',
      label: 'Parité',
      statKeys: ABILITY_KEYS,
      aggregate: 'evenCount',
      operator: '=',
      target: 3,
    },
    {
      id: 'sumModifiers',
      label: 'Somme des modificateurs',
      statKeys: ABILITY_KEYS,
      aggregate: 'sumModifiers',
      operator: '=',
      target: 6,
    },
  ],
  applyRacialModifiers: true,
};
