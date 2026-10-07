import type fr from '../../fr/map/exploration';
import type { Translation } from '../../../types';

export default {
  commands: {
    enable: 'Enable exploration',
    disable: 'Disable exploration',
    reveal: 'Reveal an area',
    forget: 'Forget an area',
    reset: 'Reset exploration',
  },
  resetConfirm: {
    title: 'Reset exploration',
    message: 'Everything the party has explored on this scene will be forgotten.',
  },
  shapes: {
    rect: 'Rectangle',
    circle: 'Circle',
    lasso: 'Freehand',
  },
  modes: {
    reveal: {
      label: 'Reveal',
      hint: "Add to the party's explored areas (Alt: the opposite)",
    },
    forget: {
      label: 'Forget',
      hint: "Remove from the party's explored areas (Alt: the opposite)",
    },
  },
  memoryHint: 'What the party has seen on this scene',
  sceneSwitch: 'Scene exploration',
  shape: 'Shape',
  mode: 'Mode',
  reset: 'Reset',
  resetHint: 'Forget everything the party has explored on this scene',
} satisfies Translation<typeof fr>;
