import type fr from '../../fr/map/fog';
import type { Translation } from '../../../types';

export default {
  modes: {
    fog: 'Add fog',
    clear: 'Remove fog',
  },
  shapes: {
    rect: {
      label: 'Rectangle',
      hint: 'Drag a rectangle. Alt: reverse mode for the gesture.',
    },
    circle: {
      label: 'Circle',
      hint: 'Drag from the center. ⇧: radius in whole squares. Alt: reverse mode.',
    },
    lasso: {
      label: 'Freehand',
      hint: 'Draw the outline freehand. Alt: reverse mode.',
    },
    select: {
      label: 'Selection',
      hint: 'Click, drag, resize or delete (Del) the zones.',
    },
  },
  shape: 'Shape',
  mode: 'Mode',
  add: 'Add',
  remove: 'Remove',
  coverAllHint: 'The whole map under fog (placed zones disappear)',
  clearAllHint: 'No fog at all (placed zones disappear)',
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
  coverAllWithFog: 'Cover everything with fog',
} satisfies Translation<typeof fr>;
