import type fr from '../../fr/map/voice';
import type { Translation } from '../../../types';

export default {
  title: 'Scene voice',
  table: 'Table',
  tableHint: 'Everyone hears everyone',
  proximity: 'Proximity',
  proximityHint: 'By distance and walls',
  clearRange: 'Clear range',
  maxRange: 'Maximum range',
  cells: '{count, plural, one {# square} other {# squares}}',
  change: 'Scene voice',
} satisfies Translation<typeof fr>;
