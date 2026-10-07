import type fr from '../../fr/map/fog';
import type { Translation } from '../../../types';

export default {
  modes: {
    fog: 'Add fog',
    clear: 'Remove fog',
  },
  shapes: {
    rect: { label: 'Rectangle' },
    circle: { label: 'Circle' },
    lasso: { label: 'Freehand' },
    select: { label: 'Selection' },
  },
  shape: 'Shape',
  mode: 'Mode',
  add: 'Add',
  remove: 'Remove',
  coverAll: 'Cover all',
  clearAll: 'Reveal all',
  fog: 'Fog',
  cleared: 'Revealed',
  order:
    '{shape}. Zones apply in the order they were created: the most recent one covering a point wins.',
  changeMode: 'Change the mode',
  zone: 'Fog zone',
  clearedZone: 'Revealed zone',
  toFog: 'Turn into fog',
  toCleared: 'Turn into a revealed zone',
  memory: {
    label: 'Memory',
    hint: 'Players keep what they have already seen, in grey',
    reveal: { label: 'Mark seen', hint: 'Players will remember it (Alt: the opposite)' },
    forget: { label: 'Forget', hint: 'Players forget it (Alt: the opposite)' },
    reset: 'Clear the memory',
  },
  more: 'More actions',
  coverAllWithFog: 'Cover everything with fog',
} satisfies Translation<typeof fr>;
