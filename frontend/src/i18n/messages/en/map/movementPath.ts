import type fr from '../../fr/map/movementPath';
import type { Translation } from '../../../types';

export default {
  show: 'Show movement paths',
  hide: 'Hide movement paths',
  forcedShown: 'Movement paths shown by the GM',
  forcedHidden: 'Movement paths hidden by the GM',
  tableRule: 'Movement paths for the table',
  tableRuleCommand: 'Movement paths',
  rules: {
    free: "Each player's choice",
    shown: 'Always shown',
    hidden: 'Hidden',
  },
} satisfies Translation<typeof fr>;
