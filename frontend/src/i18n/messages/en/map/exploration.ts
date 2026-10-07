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
  reset: 'Reset',
} satisfies Translation<typeof fr>;
