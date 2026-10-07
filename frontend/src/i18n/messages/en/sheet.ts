import type fr from '../fr/sheet';
import type { Translation } from '../../types';

export default {
  effects: {
    prerequisite: 'Prerequisite: {text}',
    rank: 'Rank {rank}: {name}',
    grants: 'Grants: {name}',
    andOthers: '{names} and {count, plural, one {# other} other {# others}}',
    rolls: 'Changes some rolls',
    conditional: '(conditional)',
    atLeast: '{name} at least {value}',
    atMost: '{name} at most {value}',
    immunity: 'Immunity to some damage',
    resistance: 'Resistance to some damage',
    reduction: 'Damage reduction {value}',
  },
  explain: {
    disabled: '{name}: {value} (disabled)',
    base: 'Base: {value}',
    pair: '{name}: {value}',
  },
  formula: {
    pickCharacter: '{what}: pick a character to use its values',
    pickCharacterFor: '“{name}”: pick a character to use its attributes',
    attribute: 'Attribute',
    modifier: 'Modifier',
    empty: 'Empty formula',
    numberExpected: 'Number expected',
    invalid: 'Invalid formula',
  },
  unavailable: 'Character unavailable',
  conflict: {
    title: 'Sheet changed meanwhile',
    detail:
      'This sheet was just changed elsewhere (by the GM or in another tab): it was reloaded. Make your change again.',
  },
} satisfies Translation<typeof fr>;
