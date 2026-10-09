import type fr from '../../fr/map/ui';
import type { Translation } from '../../../types';

export default {
  items: '{count, plural, one {# item} other {# items}}',
  selectionOf: 'Selection: {title}',
  deselect: 'Deselect',
  allKinds: 'All',
  kindFilter: 'Selected types',
  editStats: 'Edit stats',
  inspectorOf: 'Inspector: {title}',
  closeInspector: 'Close the inspector',
  nothing: 'Nothing to adjust here.',
  noPlayerCharacter: 'No player character in the campaign.',
  allPlayers: 'All players',
  othersFade: 'The others fade while this one stays selected.',
  locked: 'locked',
  dragReset: 'Drag to move · double click: reset position',
  drag: 'Drag to move',
  noAction: 'No action here',
} satisfies Translation<typeof fr>;
