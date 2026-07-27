import type { FormulaNode, StatDefinition } from '@/modules/game-system/types';

// Miroir exact du système actuel : formule de modificateur floor((v-10)/2),
// répétée aujourd'hui dans CharacterContext.tsx, character-variables.ts,
// discord/interactions/route.ts, dice-roller.tsx, FicheWidgets.tsx,
// FloatingEditTabs.tsx et app/creation/page.tsx.
function abilityModifierFormula(key: string): FormulaNode {
  return {
    type: 'floor',
    arg: {
      type: 'div',
      args: [
        { type: 'sub', args: [{ type: 'stat', key }, { type: 'const', value: 10 }] },
        { type: 'const', value: 2 },
      ],
    },
  };
}

const ABILITY_KEYS = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'] as const;

const ABILITIES: StatDefinition[] = ABILITY_KEYS.map((key, i) => ({
  key,
  label: key,
  category: 'ability',
  dataType: 'number',
  modifierFormula: abilityModifierFormula(key),
  minFormula: { type: 'const', value: 1 },
  defaultValue: 10,
  isRollable: true,
  rollUsesModifier: true,
  origin: 'module',
  group: 'Caractéristiques',
  order: i,
}));

const COMBAT_STATS: StatDefinition[] = [
  {
    key: 'Defense',
    label: 'Défense',
    shortLabel: 'Déf',
    category: 'derived',
    dataType: 'number',
    valueFormula: { type: 'add', args: [{ type: 'const', value: 10 }, { type: 'modifier', key: 'DEX' }] },
    isRollable: false,
    origin: 'module',
    group: 'Combat',
    order: 10,
  },
  {
    key: 'Contact',
    label: 'Contact',
    shortLabel: 'Ctt',
    category: 'derived',
    dataType: 'number',
    // niveau référence directement le champ Character.niveau (pas une StatDefinition dédiée) — un noeud
    // {type:'stat'} sur une clé hors schéma retombe sur sa valeur brute dans le document personnage
    // (cf resolveStatValue), donc valide sans déclarer 'niveau' comme ability/derived. Le "+1" de base
    // et le "-1" du niveau de départ s'annulent (personnage créé au niveau 1) : mod(carac) + niveau.
    valueFormula: { type: 'add', args: [{ type: 'modifier', key: 'FOR' }, { type: 'stat', key: 'niveau' }] },
    isRollable: false,
    origin: 'module',
    group: 'Combat',
    order: 11,
  },
  {
    key: 'Distance',
    label: 'Distance',
    shortLabel: 'Dst',
    category: 'derived',
    dataType: 'number',
    valueFormula: { type: 'add', args: [{ type: 'modifier', key: 'DEX' }, { type: 'stat', key: 'niveau' }] },
    isRollable: false,
    origin: 'module',
    group: 'Combat',
    order: 12,
  },
  {
    key: 'Magie',
    label: 'Magie',
    shortLabel: 'Mag',
    category: 'derived',
    dataType: 'number',
    // Le plus haut des trois modificateurs "mentaux" (INT, SAG, CHA) — un personnage lance ses sorts
    // avec sa meilleure caractéristique parmi les trois, pas toujours CHA.
    valueFormula: {
      type: 'add',
      args: [
        { type: 'max', args: [{ type: 'modifier', key: 'INT' }, { type: 'modifier', key: 'SAG' }, { type: 'modifier', key: 'CHA' }] },
        { type: 'stat', key: 'niveau' },
      ],
    },
    isRollable: false,
    origin: 'module',
    group: 'Combat',
    order: 13,
  },
  {
    key: 'INIT',
    label: 'Initiative',
    shortLabel: 'INIT',
    category: 'derived',
    dataType: 'number',
    valueFormula: { type: 'stat', key: 'DEX' },
    isRollable: false,
    origin: 'module',
    group: 'Combat',
    order: 14,
  },
];

const VITALS: StatDefinition[] = [
  {
    key: 'PV_Max',
    label: 'PV Max',
    category: 'derived',
    dataType: 'number',
    valueFormula: {
      type: 'add',
      args: [
        { type: 'const', value: 1 },
        { type: 'modifier', key: 'CON' },
        { type: 'diceField', key: 'deVie' },
      ],
    },
    origin: 'module',
    group: 'Vitals',
    order: 20,
  },
  {
    key: 'PV',
    label: 'PV',
    category: 'vital',
    dataType: 'number',
    minFormula: { type: 'const', value: 0 },
    maxFormula: { type: 'stat', key: 'PV_Max' },
    origin: 'module',
    group: 'Vitals',
    order: 21,
  },
];

export const DND_CLASSIC_STATS: StatDefinition[] = [...ABILITIES, ...COMBAT_STATS, ...VITALS];
